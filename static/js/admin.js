// admin.js - Painel Administrativo Studio JM
// Modal com cadastro rápido de cliente (nome + telefone)

(function() {
    // ---------- UTILITÁRIOS ----------
    // Formata telefone para formato brasileiro (XX) 9XXXX-XXXX
    function formatarTelefone(tel) {
        if (!tel || tel === "Não informado") return tel;
        
        // Remove caracteres não-numéricos
        const numeros = tel.replace(/\D/g, '');
        
        // Se tiver 11 dígitos (com DDD + 9), formata como (XX) 9XXXX-XXXX
        if (numeros.length === 11) {
            return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
        }
        // Se tiver 10 dígitos (sem o 9), formata como (XX) XXXX-XXXX
        if (numeros.length === 10) {
            return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
        }
        
        // Se não conseguir formatar, retorna como está
        return tel;
    }

    // ---------- Elementos do calendário ----------
    const diasGrid    = document.getElementById('diasGrid');
    const mesAnoEl    = document.getElementById('mesAno');
    const detalhesDia = document.getElementById('detalhesDia');
    const prevBtn     = document.getElementById('prevMonth');
    const nextBtn     = document.getElementById('nextMonth');

    let mesAtual      = new Date().getMonth();
    let anoAtual      = new Date().getFullYear();
    let dataSelecionada = null;

    const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                   "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

    // Busca dias com agendamento no mês
    async function buscarDiasComAgendamento() {
        try {
            const resp = await fetch(`/api/admin/agendamentos-dias?mes=${mesAtual+1}&ano=${anoAtual}`);
            const data = await resp.json();
            return data.ok ? data.dias : [];
        } catch {
            return [];
        }
    }

    // Renderiza o calendário
    async function renderizarCalendario() {
        const diasComAg = await buscarDiasComAgendamento();
        mesAnoEl.innerText = `${meses[mesAtual]} de ${anoAtual}`;
        diasGrid.innerHTML = '';

        const primeiroDia = new Date(anoAtual, mesAtual, 1).getDay();
        const ultimoDia   = new Date(anoAtual, mesAtual + 1, 0).getDate();
        const hoje        = new Date();
        const hojeStr     = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;

        for (let i = 0; i < primeiroDia; i++) {
            const vazio = document.createElement('div');
            vazio.className = 'dia-btn vazio';
            diasGrid.appendChild(vazio);
        }

        for (let dia = 1; dia <= ultimoDia; dia++) {
            const dataStr = `${anoAtual}-${String(mesAtual+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
            const isDomingo = new Date(anoAtual, mesAtual, dia).getDay() === 0;
            const btn = document.createElement('div');
            btn.textContent = dia;
            btn.className = 'dia-btn';
            btn.addEventListener('click', () => selecionarDia(dataStr, btn));

            if (dataStr === hojeStr && !isDomingo) btn.classList.add('hoje');
            if (diasComAg.includes(dataStr)) btn.classList.add('tem-agendamento');
            if (dataStr === dataSelecionada) btn.classList.add('selecionado');

            diasGrid.appendChild(btn);
        }
    }

    async function selecionarDia(dataStr, btnEl) {
        document.querySelectorAll('.dia-btn.selecionado').forEach(b => b.classList.remove('selecionado'));
        btnEl.classList.add('selecionado');
        dataSelecionada = dataStr;
        await carregarDetalhesDia(dataStr);
    }

    async function carregarDetalhesDia(data) {
        detalhesDia.innerHTML = '<div class="text-center my-4"><div class="spinner-border text-warning"></div> Carregando agenda...</div>';
        try {
            const resp = await fetch(`/api/admin/horarios?data=${data}`);
            const result = await resp.json();
            if (!result.ok) throw new Error(result.erro);

            const slots = result.slots;
            if (!slots.length) {
                detalhesDia.innerHTML = `<div class="alert alert-info">📅 Nenhum horário disponível neste dia.</div>`;
                return;
            }

            let html = `<div class="detalhes-container">
                <h3 class="h5 mb-4"><i class="bi bi-calendar-event"></i> Agenda de ${data.split('-').reverse().join('/')}</h3>
                <div class="slot-grid">`;

            slots.forEach(slot => {
                if (slot.status === 'livre') {
                    html += `<div class="slot-card slot-livre">
                        <div class="slot-horario"><i class="bi bi-clock"></i> ${slot.horario}</div>
                        <div class="slot-info text-center">
                            <span class="badge bg-success text-white p-2 w-100"><i class="bi bi-check-circle"></i> Livre</span>
                        </div>
                    </div>`;
                } else {
                    const ag = slot.agendamento;
                    html += `<div class="slot-card slot-ocupado">
                        <div class="slot-horario"><i class="bi bi-clock"></i> ${slot.horario}</div>
                        <div class="slot-info">
                            <div class="cliente-nome"><i class="bi bi-person-circle"></i> ${ag.cliente}</div>
                            <div class="cliente-telefone"><i class="bi bi-telephone-fill"></i> ${formatarTelefone(ag.telefone)}</div>
                            <div class="procedimento"><i class="bi bi-scissors"></i> ${ag.procedimento}</div>
                            <div class="slot-status mb-2">
                                <span class="status-badge ${ag.status}">${ag.status.toUpperCase()}</span>
                            </div>
                            <div class="slot-acoes">`;
                    if (ag.status === 'pendente') {
                        html += `<form method="post" action="/admin/confirmar/${ag.id}">
                                    <button class="btn-confirmar-forte w-100"><i class="bi bi-check-lg"></i> Confirmar</button>
                                 </form>`;
                    }
                    if (ag.status !== 'cancelado' && ag.status !== 'finalizado') {
                        html += `<form method="post" action="/admin/cancelar/${ag.id}">
                                    <button class="btn-cancelar-forte w-100" onclick="return confirm('Cancelar este agendamento?')"><i class="bi bi-x-lg"></i> Cancelar</button>
                                 </form>`;
                    }
                    html += `</div></div></div>`;
                }
            });

            html += `</div></div>`;
            detalhesDia.innerHTML = html;
        } catch (err) {
            detalhesDia.innerHTML = `<div class="alert alert-danger">Erro ao carregar agenda: ${err.message}</div>`;
        }
    }

    // Navegação dos meses
    prevBtn.addEventListener('click', () => {
        mesAtual--;
        if (mesAtual < 0) { mesAtual = 11; anoAtual--; }
        dataSelecionada = null;
        renderizarCalendario();
        detalhesDia.innerHTML = `<div class="glass-card placeholder-card text-center p-5">
            <i class="bi bi-calendar2-heart display-3 text-gold mb-3"></i>
            <p class="lead mb-0">Selecione um dia no calendário</p>
        </div>`;
    });

    nextBtn.addEventListener('click', () => {
        mesAtual++;
        if (mesAtual > 11) { mesAtual = 0; anoAtual++; }
        dataSelecionada = null;
        renderizarCalendario();
        detalhesDia.innerHTML = `<div class="glass-card placeholder-card text-center p-5">
            <i class="bi bi-calendar2-heart display-3 text-gold mb-3"></i>
            <p class="lead mb-0">Selecione um dia no calendário</p>
        </div>`;
    });

    renderizarCalendario();

    // ---------- MODAL: carregar horários e criar agendamento com novo cliente ----------
    async function carregarHorariosModal(dataStr) {
        const selectHorario = document.getElementById('admin_horario');
        if (!selectHorario) return;

        selectHorario.innerHTML = '<option disabled selected>Carregando horários...</option>';
        selectHorario.disabled = true;

        // Verifica domingo
        if (new Date(dataStr + 'T12:00:00').getDay() === 0) {
            selectHorario.innerHTML = '<option disabled selected>Fechado aos domingos</option>';
            return;
        }

        try {
            const resp = await fetch(`/admin/horarios-disponiveis?data=${dataStr}`);
            const result = await resp.json();
            if (!result.ok) throw new Error(result.erro);

            const horarios = result.horarios;
            if (!horarios.length) {
                selectHorario.innerHTML = '<option disabled selected>Nenhum horário disponível</option>';
                return;
            }

            let options = '<option value="" disabled selected>Selecione um horário</option>';
            horarios.forEach(h => {
                options += `<option value="${h}">${h}</option>`;
            });
            selectHorario.innerHTML = options;
            selectHorario.disabled = false;
        } catch (err) {
            selectHorario.innerHTML = '<option disabled selected>Erro ao carregar horários</option>';
            console.error('Erro no modal:', err);
        }
    }

    // Quando a data do modal mudar, carrega os horários
    document.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'admin_data') {
            const dataVal = e.target.value;
            if (dataVal) carregarHorariosModal(dataVal);
        }
    });
    document.addEventListener('input', function(e) {
        if (e.target && e.target.id === 'admin_data') {
            const dataVal = e.target.value;
            if (dataVal) carregarHorariosModal(dataVal);
        }
    });

    // Reset ao fechar o modal
    document.addEventListener('hidden.bs.modal', function(e) {
        if (e.target && e.target.id === 'modalNovoAgendamento') {
            const form = document.getElementById('formAdminAgendamento');
            if (form) form.reset();
            const selHorario = document.getElementById('admin_horario');
            if (selHorario) {
                selHorario.innerHTML = '<option disabled selected>Selecione uma data primeiro</option>';
                selHorario.disabled = true;
            }
            const feedback = document.getElementById('adminFormFeedback');
            if (feedback) feedback.innerHTML = '';
        }
    });

    // Submissão do formulário (envia nome e telefone)
    document.addEventListener('submit', async function(e) {
        if (!e.target || e.target.id !== 'formAdminAgendamento') return;
        e.preventDefault();

        const nome      = document.getElementById('admin_nome_cliente').value.trim();
        const telefone  = document.getElementById('admin_telefone_cliente').value.trim();
        const data      = document.getElementById('admin_data').value;
        const horario   = document.getElementById('admin_horario').value;
        const procedimento = document.getElementById('admin_procedimento').value;
        const status    = document.getElementById('admin_status').value;

        const feedback  = document.getElementById('adminFormFeedback');
        const submitBtn = e.target.querySelector('[type="submit"]');

        if (!nome || !data || !horario || !procedimento) {
            feedback.innerHTML = '<div class="alert alert-danger">Preencha todos os campos obrigatórios.</div>';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Salvando...';
        feedback.innerHTML = '';

        const formData = new FormData();
        formData.append('nome_cliente', nome);
        formData.append('telefone_cliente', telefone);
        formData.append('data', data);
        formData.append('horario', horario);
        formData.append('procedimento', procedimento);
        formData.append('status', status);

        try {
            const resp = await fetch('/admin/agendar', { method: 'POST', body: formData });
            const result = await resp.json();

            if (result.ok) {
                feedback.innerHTML = '<div class="alert alert-success"><i class="bi bi-check-circle-fill"></i> Agendamento criado com sucesso!</div>';
                setTimeout(() => location.reload(), 1000);
            } else {
                feedback.innerHTML = `<div class="alert alert-danger">${result.erro || 'Erro ao criar agendamento'}</div>`;
                submitBtn.disabled = false;
                submitBtn.textContent = 'Salvar Agendamento';
            }
        } catch (err) {
            feedback.innerHTML = '<div class="alert alert-danger">Erro de conexão. Tente novamente.</div>';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Salvar Agendamento';
        }
    });
})();