from app import app, db, Usuario

with app.app_context():
    print("-> Iniciando reparo do Administrador...")
    
    # 1. Procura se já existe algum usuário com esse e-mail e apaga para não dar conflito
    admin_antigo = Usuario.query.filter_by(email="joycimara12@studio.com").first()
    if admin_antigo:
        print(f"-> Removendo usuário antigo encontrado (ID: {admin_antigo.id})...")
        db.session.delete(admin_antigo)
        db.session.commit()

    # 2. Cria o administrador do zero absoluto com os dados limpos
    print("-> Criando novo perfil administrativo limpo...")
    novo_admin = Usuario(
        nome="Joycimara Admin", 
        email="joycimara12@studio.com", 
        telefone="31000000000", 
        papel="admin"
    )
    
    # 3. Define a senha explicitamente gerando a criptografia correta
    novo_admin.set_password("jm919127")
    
    # 4. Salva no banco de dados
    db.session.add(novo_admin)
    db.session.commit()
    
    print("==================================================")
    print("  ADMINISTRADOR RECONSTRUÍDO COM SUCESSO!")
    print("  E-mail: joycimara12@studio.com")
    print("  Senha: jm919127")
    print("==================================================")