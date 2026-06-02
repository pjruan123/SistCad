import os
import secrets
from datetime import datetime, date
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import extract

# Bibliotecas oficiais da Inteligência Artificial do Google
from google import genai
from google.genai import types

basedir = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__)
app.config["SECRET_KEY"] = "uma-chave-secreta-muito-segura-studio-jm"
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(basedir, "studio_jm.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

UPLOAD_FOLDER = os.path.join(basedir, "static", "uploads")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif"}

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"
login_manager.login_message = "Por favor, faça login para acessar esta página."
login_manager.login_message_category = "warning"

GRADE_HORARIOS = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00",
                  "15:00", "16:00", "17:00", "18:00", "19:00"]

# CONFIGURAÇÃO DO CLIENTE GEMINI COM A CHAVE ATUALIZADA
client = genai.Client(api_key="AQ.Ab8RN6LTeTJPukyYZtTFXCgJekA4py2Lq3LvPSmp0i_uEL87yQ")

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# =============================================================================
# MODELOS DE DADOS
# =============================================================================

class Usuario(db.Model, UserMixin):
    id          = db.Column(db.Integer, primary_key=True)
    nome        = db.Column(db.String(100), nullable=False)
    email       = db.Column(db.String(120), unique=True, nullable=False)
    telefone    = db.Column(db.String(20), unique=True, nullable=True)
    senha_hash  = db.Column(db.String(200), nullable=False)
    papel       = db.Column(db.String(20), default="cliente")
    token       = db.Column(db.String(64), unique=True, nullable=True)

    agendamentos = db.relationship("Agendamento", backref="usuario", lazy=True)

    def set_password(self, senha_pura):
        self.senha_hash = generate_password_hash(senha_pura)
        if not self.token:
            self.token = secrets.token_urlsafe(32)

    def check_password(self, senha_pura):
        return check_password_hash(self.senha_hash, senha_pura)

class Agendamento(db.Model):
    id           = db.Column(db.Integer, primary_key=True)
    procedimento = db.Column(db.String(100), nullable=False)
    data         = db.Column(db.Date, nullable=False)
    horario      = db.Column(db.String(10), nullable=False)
    status       = db.Column(db.String(20), default="pendente")
    observacoes  = db.Column(db.Text, nullable=True)
    imagem       = db.Column(db.String(200), nullable=True)
    user_id      = db.Column(db.Integer, db.ForeignKey("usuario.id"), nullable=False)

    @property
    def status_real(self):
        if self.status == "cancelado":
            return "cancelado"
        try:
            data_hora = datetime.combine(self.data, datetime.strptime(self.horario, "%H:%M").time())
            if data_hora < datetime.now():
                return "finalizado"
        except:
            pass
        return self.status

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(Usuario, int(user_id))

# =============================================================================
# INICIALIZAÇÃO E AUTO-REPARO DE LOGIN / TABELAS
# =============================================================================

with app.app_context():
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
    db.create_all()
    for coluna, definicao in [("token", "ALTER TABLE usuario ADD COLUMN token VARCHAR(64)"),
                              ("imagem", "ALTER TABLE agendamento ADD COLUMN imagem VARCHAR(200)")]:
        try:
            with db.engine.connect() as conn:
                conn.execute(db.text(definicao))
                conn.commit()
        except:
            pass
            
    for user in Usuario.query.all():
        if not user.token:
            user.token = secrets.token_urlsafe(32)
            db.session.add(user)
    db.session.commit()
    
    admin = Usuario.query.filter_by(email="joycimara12@studio.com").first()
    if not admin:
        admin = Usuario(nome="Joycimara Admin", email="joycimara12@studio.com", telefone="31000000000", papel="admin")
        db.session.add(admin)
        
    admin.set_password("jm919127")
    db.session.commit()

# =============================================================================
# FUNÇÕES AUXILIARES / FERRAMENTAS EXCLUSIVAS DA IA
# =============================================================================

def gerar_horarios(data_consulta):
    if data_consulta.weekday() == 6:
        return []
    hoje = date.today()
    agora_str = datetime.now().strftime("%H:%M")
    reservados = Agendamento.query.filter_by(data=data_consulta).filter(Agendamento.status != "cancelado").all()
    ocupados = {r.horario for r in reservados}
    slots = []
    for h in GRADE_HORARIOS:
        if data_consulta == hoje and h <= agora_str:
            continue
        if h not in ocupados:
            slots.append(h)
    return slots

def _build_slots_admin(data_consulta):
    agendamentos = Agendamento.query.filter_by(data=data_consulta).order_by(Agendamento.horario).all()
    slots = []
    for h in GRADE_HORARIOS:
        ag = next((a for a in agendamentos if a.horario == h and a.status != "cancelado"), None)
        if ag:
            slots.append({
                "horario": h,
                "status": "ocupado",
                "agendamento": {
                    "id": ag.id,
                    "cliente": ag.usuario.nome,
                    "telefone": ag.usuario.telefone or "Não informado",
                    "procedimento": ag.procedimento,
                    "status": ag.status_real,
                    "imagem": ag.imagem,
                },
            })
        else:
            slots.append({"horario": h, "status": "livre", "agendamento": None})
    return slots

def ia_consultar_banco_agendamentos(data_inicio: str, data_fim: str) -> dict:
    """
    Busca no banco de dados todos os agendamentos registrados em um intervalo específico de datas.
    """
    with app.app_context():
        try:
            dt_ini = datetime.strptime(data_inicio, "%Y-%m-%d").date()
            dt_fim = datetime.strptime(data_fim, "%Y-%m-%d").date()
            
            resultados = Agendamento.query.filter(
                Agendamento.data.between(dt_ini, dt_fim),
                Agendamento.status != "cancelado"
            ).order_by(Agendamento.data, Agendamento.horario).all()
            
            if not resultados:
                return {"status": "sucesso", "resultado": f"Nenhum agendamento ativo encontrado entre {data_inicio} e {data_fim}."}
                
            resposta_linhas = []
            for r in resultados:
                resposta_linhas.append(
                    f"- Dia: {r.data.strftime('%d/%m/%Y')} às {r.horario} | Cliente: {r.usuario.nome} | Procedimento: {r.procedimento} | Status: {r.status_real}"
                )
            
            return {"status": "sucesso", "resultado": "\n".join(resposta_linhas)}
        except Exception as e:
            return {"status": "erro", "resultado": f"Erro ao acessar banco de dados: {str(e)}"}

# =============================================================================
# ROTAS PÚBLICAS E DO CLIENTE (MÓDULO DE CADASTRO INTEIRAMENTE BLINDADO)
# =============================================================================

@app.route("/")
def index():
    if current_user.is_authenticated:
        if current_user.papel == "admin":
            return redirect(url_for("admin"))
        agendamentos = Agendamento.query.filter_by(user_id=current_user.id).order_by(Agendamento.data, Agendamento.horario).all()
        return render_template("index.html", agendamentos=agendamentos)
    return render_template("index.html", agendamentos=None)

@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("index"))
    if request.method == "POST":
        email = request.form.get("email")
        senha = request.form.get("senha")
        usuario = Usuario.query.filter_by(email=email).first()
        if usuario and usuario.check_password(senha):
            login_user(usuario)
            flash(f"Bem-vinda de volta, {usuario.nome}!", "success")
            return redirect(url_for("admin") if usuario.papel == "admin" else url_for("index"))
        flash("E-mail ou senha incorretos.", "danger")
    return render_template("login.html")

@app.route("/cadastro", methods=["GET", "POST"])
def cadastro():
    if current_user.is_authenticated:
        return redirect(url_for("index"))
    if request.method == "POST":
        nome = request.form.get("nome", "").strip()
        email = request.form.get("email", "").strip()
        telefone = request.form.get("telefone", "").strip()
        senha = request.form.get("senha", "").strip()
        
        if not nome or not email or not senha:
            flash("Preencha todos os campos obrigatórios.", "danger")
            return redirect(url_for("cadastro"))
            
        # Limpa o formato do telefone salvando só números
        tel_limpo = "".join(filter(str.isdigit, telefone)) if telefone else None
        
        # Validação ativa de duplicidade de e-mail antes de tentar salvar
        if Usuario.query.filter_by(email=email).first():
            flash("Este e-mail já está cadastrado no sistema.", "danger")
            return redirect(url_for("cadastro"))
            
        # Validação ativa de duplicidade de telefone antes de tentar salvar
        if tel_limpo and Usuario.query.filter_by(telefone=tel_limpo).first():
            flash("Este número de telefone já está vinculado a outra conta.", "danger")
            return redirect(url_for("cadastro"))
            
        try:
            novo = Usuario(nome=nome, email=email, telefone=tel_limpo, papel="cliente")
            novo.set_password(senha)
            db.session.add(novo)
            db.session.commit()
            login_user(novo)
            flash("Cadastro realizado com sucesso!", "success")
            return redirect(url_for("index"))
        except Exception as e:
            db.session.rollback()  # Anula a inserção para não travar o Flask
            flash("Erro de integridade ao processar o cadastro. Verifique os dados informados.", "danger")
            return redirect(url_for("cadastro"))
            
    return render_template("cadastro.html")

@app.route("/agendamento")
@login_required
def agendamento():
    hoje = date.today().isoformat()
    return render_template("agendamento.html", hoje=hoje)

@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("Sessão encerrada com sucesso.", "info")
    return redirect(url_for("index"))

@app.route("/api/horarios", methods=["GET"])
def api_horarios():
    data_str = request.args.get("data")
    if not data_str:
        return jsonify({"ok": False, "erro": "Data inválida."}), 400
    try:
        data = datetime.strptime(data_str, "%Y-%m-%d").date()
    except:
        return jsonify({"ok": False, "erro": "Formato inválido."}), 400
    return jsonify({"ok": True, "horarios": gerar_horarios(data)})

@app.route("/agendamento/reservar", methods=["POST"])
@login_required
def reservar():
    data_str = request.form.get("data")
    horario = request.form.get("horario")
    procedimento = request.form.get("procedimento")
    if not all([data_str, horario, procedimento]):
        return jsonify({"ok": False, "erro": "Dados incompletos."}), 400
    try:
        data = datetime.strptime(data_str, "%Y-%m-%d").date()
    except:
        return jsonify({"ok": False, "erro": "Data inválida."}), 400
    ocupado = Agendamento.query.filter_by(data=data, horario=horario).filter(Agendamento.status != "cancelado").first()
    if ocupado:
        return jsonify({"ok": False, "erro": "Horário já reservado."}), 400
    novo = Agendamento(user_id=current_user.id, data=data, horario=horario, procedimento=procedimento)
    db.session.add(novo)
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/cliente/cancelar/<int:id>", methods=["DELETE"])
@login_required
def api_cancelar_agendamento(id):
    ag = db.session.get(Agendamento, id)
    if not ag or ag.user_id != current_user.id:
        return jsonify({"ok": False, "erro": "Ação não autorizada."}), 403
    if ag.status_real == "finalizado":
        return jsonify({"ok": False, "erro": "Não é possível cancelar um serviço concluído."}), 400
    ag.status = "cancelado"
    db.session.commit()
    return jsonify({"ok": True})

# =============================================================================
# ROTA DO CHAT IA - SISTEMA OPERACIONAL
# =============================================================================

@app.route("/api/admin/chat", methods=["POST"])
@login_required
def api_admin_chat_ia():
    if current_user.papel != "admin":
        return jsonify({"ok": False, "erro": "Não autorizado"}), 403
        
    corpo = request.get_json() or {}
    mensagem_usuario = corpo.get("mensagem", "").strip()
    
    if not mensagem_usuario:
        return jsonify({"ok": False, "erro": "Mensagem vazia."}), 400
        
    data_hoje_obj = date.today()
    data_hoje = data_hoje_obj.strftime("%Y-%m-%d")
    
    instrucoes_sistema = (
        f"Você é a Inteligência Artificial e assistente inteligente oficial do Studio JM. Hoje é dia {data_hoje}. "
        "Seu papel é auxiliar a administradora Joycimara a verificar a situação da agenda utilizando os dados reais do sistema. "
        "Sempre que ela solicitar listagens, intervalos de tempo ou dados de clientes, utilize obrigatoriamente a ferramenta fornecida "
        "('ia_consultar_banco_agendamentos') para ler as informações do banco de dados real. "
        "Interprete o dicionário retornado pela ferramenta e diga de forma clara e amigável o que encontrou para a Joycimara."
    )
    
    try:
        resposta = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=mensagem_usuario,
            config=types.GenerateContentConfig(
                system_instruction=instrucoes_sistema,
                tools=[ia_consultar_banco_agendamentos],
                temperature=0.1
            )
        )
        
        if resposta and resposta.text:
            return jsonify({"ok": True, "resposta": resposta.text, "status_ia": "online"})
        else:
            raise Exception("Resposta vazia da API do Gemini.")
            
    except Exception as e:
        print(f"[Aviso] Usando resposta local por cota excedida ou falha: {str(e)}")
        msg_minuscula = mensagem_usuario.lower()
        
        if "hoje" in msg_minuscula or "agendamentos de hoje" in msg_minuscula:
            dados = ia_consultar_banco_agendamentos(data_hoje, data_hoje)
            res_texto = f"Aqui estão os agendamentos registrados para o dia de hoje ({data_hoje_obj.strftime('%d/%m/%Y')}):\n\n" + dados["resultado"]
            return jsonify({"ok": True, "resposta": res_texto, "status_ia": "offline"})
            
        elif "agenda" in msg_minuscula or "listar" in msg_minuscula or "agendamentos" in msg_minuscula:
            dados = ia_consultar_banco_agendamentos(data_hoje, "2026-12-31")
            res_texto = "Aqui estão os próximos compromissos da agenda ativa:\n\n" + dados["resultado"]
            return jsonify({"ok": True, "resposta": res_texto, "status_ia": "offline"})
            
        else:
            res_texto = "Olá Joycimara! O servidor externo da IA está indisponível temporariamente devido ao limite de requisições gratuitas. Contudo, você pode digitar 'hoje' ou 'agenda' para extrair os dados locais diretamente através do sistema de segurança."
            return jsonify({"ok": True, "resposta": res_texto, "status_ia": "offline"})

# =============================================================================
# CONTROLE DO PAINEL ADMINISTRATIVO (ROTA BLINDADA)
# =============================================================================

@app.route("/admin/agendar", methods=["POST"])
@login_required
def admin_agendar():
    if current_user.papel != "admin":
        return jsonify({"ok": False, "erro": "Acesso negado"}), 403

    nome_cliente = request.form.get("nome_cliente", "").strip()
    telefone_cliente = request.form.get("telefone_cliente", "").strip()
    data_str = request.form.get("data", "").strip()
    horario = request.form.get("horario", "").strip()
    procedimento = request.form.get("procedimento", "").strip()
    status = request.form.get("status", "pendente").strip()

    if not nome_cliente or not data_str or not horario or not procedimento:
        return jsonify({"ok": False, "erro": "Preencha os campos obrigatórios: Nome, Data, Horário e Procedimento."}), 400

    try:
        data = datetime.strptime(data_str, "%Y-%m-%d").date()
    except Exception:
        return jsonify({"ok": False, "erro": "Formato de data inválido."}), 400

    tel_limpo = "".join(filter(str.isdigit, telefone_cliente))
    usuario = None

    try:
        if tel_limpo:
            usuario = Usuario.query.filter_by(telefone=tel_limpo).first()

        if not usuario:
            sufixo = tel_limpo if tel_limpo else secrets.token_hex(4)
            email_provisorio = f"cliente_{sufixo}@studiojm.com"
            
            usuario = Usuario.query.filter_by(email=email_provisorio).first()

            if not usuario:
                usuario = Usuario(
                    nome=nome_cliente, 
                    telefone=tel_limpo if tel_limpo else None, 
                    email=email_provisorio, 
                    papel="cliente"
                )
                usuario.set_password(secrets.token_hex(8))
                db.session.add(usuario)
                db.session.commit()

    except Exception:
        db.session.rollback()
        usuario = Usuario.query.filter((Usuario.telefone == tel_limpo) | (Usuario.nome == nome_cliente)).first()
        if not usuario:
            return jsonify({"ok": False, "erro": "Conflito de dados: Este telefone já está em uso por outro usuário."}), 400

    try:
        ocupado = Agendamento.query.filter_by(data=data, horario=horario).filter(Agendamento.status != "cancelado").first()
        if ocupado:
            return jsonify({"ok": False, "erro": f"O horário {horario} já está ocupado no dia selecionado."}), 400
    except Exception:
        return jsonify({"ok": False, "erro": "Erro ao verificar disponibilidade de horários."}), 500

    nome_imagem = None
    if "imagem" in request.files:
        file = request.files["imagem"]
        if file and file.filename and allowed_file(file.filename):
            try:
                ext = file.filename.rsplit(".", 1)[1].lower()
                nome_imagem = f"{secrets.token_hex(16)}.{ext}"
                file.save(os.path.join(app.config["UPLOAD_FOLDER"], nome_imagem))
            except Exception:
                nome_imagem = None

    try:
        novo = Agendamento(
            user_id=usuario.id, 
            data=data, 
            horario=horario, 
            procedimento=procedimento, 
            status=status, 
            imagem=nome_imagem
        )
        db.session.add(novo)
        db.session.commit()
        return jsonify({"ok": True, "mensagem": "Agendamento criado com sucesso!"})
        
    except Exception:
        db.session.rollback()
        return jsonify({"ok": False, "erro": "Não foi possível salvar o agendamento devido a uma falha interna no banco de dados."}), 500

@app.route("/admin")
@login_required
def admin():
    if current_user.papel != "admin":
        return redirect(url_for("index"))
    agendamentos = Agendamento.query.order_by(Agendamento.data.desc(), Agendamento.horario.desc()).all()
    usuarios = Usuario.query.order_by(Usuario.nome).all()
    hoje = date.today().isoformat()
    return render_template("admin.html", agendamentos=agendamentos, usuarios=usuarios, hoje=hoje)

@app.route("/admin/clientes")
@login_required
def admin_clientes():
    if current_user.papel != "admin":
        return redirect(url_for("index"))
    clientes = Usuario.query.filter_by(papel="cliente").order_by(Usuario.nome).all()
    return render_template("admin_clientes.html", clientes=clientes)

@app.route("/api/admin/agendamentos-dias")
@login_required
def api_admin_dias_com_agendamentos():
    if current_user.papel != "admin":
        return jsonify({"ok": False}), 403
    mes = request.args.get("mes", type=int)
    ano = request.args.get("ano", type=int)
    datas = db.session.query(Agendamento.data).filter(
        extract("month", Agendamento.data) == mes,
        extract("year", Agendamento.data) == ano,
        Agendamento.status != "cancelado"
    ).distinct().all()
    dias = [d[0].isoformat() for d in datas]
    return jsonify({"ok": True, "dias": dias})

@app.route("/api/admin/horarios")
@app.route("/admin/horarios-disponiveis")
@login_required
def api_admin_horarios():
    if current_user.papel != "admin":
        return jsonify({"ok": False}), 403
    data_str = request.args.get("data")
    if not data_str:
        return jsonify({"ok": False, "erro": "Data não informada."}), 400
    try:
        data = datetime.strptime(data_str, "%Y-%m-%d").date()
    except:
        return jsonify({"ok": False, "erro": "Data inválida."}), 400
    slots = _build_slots_admin(data)
    horarios_livres = [s["horario"] for s in slots if s["status"] == "livre"]
    return jsonify({"ok": True, "slots": slots, "horarios": horarios_livres})

@app.route("/admin/confirmar/<int:id>", methods=["POST"])
@login_required
def confirmar_agendamento(id):
    if current_user.papel != "admin":
        return redirect(url_for("index"))
    ag = db.session.get(Agendamento, id)
    if ag:
        ag.status = "confirmado"
        db.session.commit()
    return redirect(url_for("admin"))

@app.route("/admin/cancelar/<int:id>", methods=["POST"])
@login_required
def cancelar_agendamento(id):
    if current_user.papel != "admin":
        return redirect(url_for("index"))
    ag = db.session.get(Agendamento, id)
    if ag:
        ag.status = "cancelado"
        db.session.commit()
    return redirect(url_for("admin"))

if __name__ == "__main__":
    app.run(debug=True)