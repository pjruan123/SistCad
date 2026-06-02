// cliente.js - Lógica completa da área do cliente
document.addEventListener('DOMContentLoaded', function() {
    // Elementos do Formulário de Criação de Agendamento
    const dataInput = document.getElementById('dataInput');
    const procedimentoSelect = document.getElementById('procedimentoSelect');
    const horariosContainer = document.getElementById('horariosContainer');
    const horarioSelecionadoHidden = document.getElementById('horarioSelecionado');
    const btnReservar = document.getElementById('btnReservar');
    const feedbackDiv = document.getElementById('feedbackMessage');
    const formNovoAgendamento = document.getElementById('formNovoAgendamento');

    // Elementos da Listagem de Agendamentos Existentes
    const listaAgendamentosDiv = document.getElementById('listaAgendamentos');
    const refreshBtn = document.getElementById('refreshAgendamentosBtn');
    
    // Gerenciamento do Modal de Cancelamento do Bootstrap
    let agendamentoIdParaCancelar = null;
    const confirmModalEl = document.getElementById('confirmModal');
    let bootstrapModal = null;
    if (confirmModalEl) {
        bootstrapModal = new bootstrap.Modal(confirmModalEl);
    }

    let horariosCache = [];

    // ---------- LÓGICA 1: CRIAR NOVO AGENDAMENTO ----------

    // Carrega horários livres ao mudar a data no input
    if (dataInput) {
        dataInput.addEventListener('change', async () => {
            const data = dataInput.value;
            if (!data) return;
            horariosContainer.innerHTML = '<div class="spinner-border spinner-border-sm text-warning" role="status"></div> Carregando...';
            try {
                const response = await fetch(`/api/horarios?data=${data}`);
                const result = await response.json();
                if (result.ok) {
                    horariosCache = result.horarios;
                    renderHorarios(horariosCache);
                } else {
                    horariosContainer.innerHTML = `<div class="text-danger">Erro: ${result.erro}</div>`;
                }
            } catch (error) {
                horariosContainer.innerHTML = '<div class="text-danger">Erro ao carregar horários.</div>';
            }
        });
    }

    // Renderiza os botões de horários disponíveis na tela
    function renderHorarios(horarios) {
        if (!horarios.length) {
            horariosContainer.innerHTML = '<div class="text-muted">Nenhum horário disponível nesta data.</div>';
            if (btnReservar) btnReservar.disabled = true;
            return;
        }
        let html = '';
        horarios.forEach(horario => {
            html += `<button type="button" class="horario-btn disponivel" data-horario="${horario}">${horario}</button>`;
        });
        horariosContainer.innerHTML = html;

        // Adiciona evento de clique em cada botão gerado dinamicamente
        document.querySelectorAll('.horario-btn.disponivel').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.horario-btn').forEach(b => b.classList.remove('selecionado'));
                btn.classList.add('selecionado');
                if (horarioSelecionadoHidden) horarioSelecionadoHidden.value = btn.dataset.horario;
                if (btnReservar) btnReservar.disabled = false;
            });
        });
    }

    // Submissão do formulário de Novo Agendamento (via AJAX)
    if (formNovoAgendamento) {
        formNovoAgendamento.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = dataInput.value;
            const procedimento = procedimentoSelect.value;
            const horario = horarioSelecionadoHidden.value;

            if (!data || !procedimento || !horario) {
                mostrarFeedback('Preencha todos os campos e selecione um horário.', 'danger');
                return;
            }

            btnReservar.disabled = true;
            btnReservar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Enviando...';

            try {
                // Rota atualizada para bater com a estrutura padrão (/agendamento/reservar)
                const formData = new FormData();
                formData.append('data', data);
                formData.append('horario', horario);
                formData.append('procedimento', procedimento);

                const response = await fetch('/agendamento/reservar', {
                    method: 'POST',
                    body: formData
                });

                // Se o redirecionamento ou a resposta for bem sucedida
                if (response.ok) {
                    mostrarFeedback('✅ Agendamento solicitado com sucesso!', 'success');
                    horarioSelecionadoHidden.value = '';
                    btnReservar.disabled = true;
                    
                    // Atualiza a grade de horários e recarrega a lista
                    dataInput.dispatchEvent(new Event('change'));
                    setTimeout(() => location.reload(), 1500);
                } else {
                    mostrarFeedback('❌ Erro ao processar agendamento.', 'danger');
                    btnReservar.disabled = false;
                    btnReservar.innerHTML = 'Solicitar Agendamento';
                }
            } catch (err) {
                mostrarFeedback('Erro de conexão. Tente novamente.', 'danger');
                btnReservar.disabled = false;
                btnReservar.innerHTML = 'Solicitar Agendamento';
            }
        });
    }

    function mostrarFeedback(msg, tipo) {
        if (!feedbackDiv) return;
        feedbackDiv.innerHTML = `
            <div class="alert alert-${tipo} alert-dismissible fade show" role="alert">
                ${msg}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>`;
        setTimeout(() => {
            const alert = feedbackDiv.querySelector('.alert');
            if (alert) alert.remove();
        }, 5000);
    }


    // ---------- LÓGICA 2: LISTAR E CANCELAR MEUS AGENDAMENTOS ----------

    // Busca os dados no backend e renderiza a tabela dinamicamente
    async function carregarMeusAgendamentos() {
        if (!listaAgendamentosDiv) return;

        listaAgendamentosDiv.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-warning" role="status"></div>
                <p class="mt-2">Carregando seus agendamentos...</p>
            </div>`;
            
        try {
            const response = await fetch('/api/cliente/meus-agendamentos');
            const data = await response.json();
            
            if (!data.ok || data.agendamentos.length === 0) {
                listaAgendamentosDiv.innerHTML = `
                    <div class="alert alert-light text-center py-4">
                        <i class="bi bi-calendar-x display-4 text-muted mb-2 d-block"></i>
                        Você não possui agendamentos marcados.
                    </div>`;
                return;
            }
            
            let html = `
                <div class="table-responsive">
                    <table class="table cliente-table align-middle">
                        <thead>
                            <tr>
                                <th>Procedimento</th>
                                <th>Data</th>
                                <th>Horário</th>
                                <th>Status</th>
                                <th>Ação</th>
                            </tr>
                        </thead>
                        <tbody>`;
            
            data.agendamentos.forEach(ag => {
                let statusBadgeColor = '';
                let botaoAcao = '';
                
                // Mapeamento visual baseado no status_real tratado pelo Backend (Python)
                if (ag.status === 'confirmado') {
                    statusBadgeColor = 'bg-success';
                    botaoAcao = `<button class="btn btn-sm btn-outline-danger btn-cancelar" data-id="${ag.id}"><i class="bi bi-x-circle"></i> Cancelar</button>`;
                } else if (ag.status === 'pendente') {
                    statusBadgeColor = 'bg-warning text-dark';
                    botaoAcao = `<button class="btn btn-sm btn-outline-danger btn-cancelar" data-id="${ag.id}"><i class="bi bi-x-circle"></i> Cancelar</button>`;
                } else if (ag.status === 'finalizado') {
                    statusBadgeColor = 'bg-info text-white';
                    botaoAcao = `<span class="text-muted"><i class="bi bi-check-all text-info"></i> Concluído</span>`;
                } else {
                    statusBadgeColor = 'bg-secondary';
                    botaoAcao = `—`;
                }
                
                html += `
                    <tr>
                        <td><strong>${ag.procedimento}</strong></td>
                        <td>${ag.data}</td>
                        <td><i class="bi bi-clock"></i> ${ag.horario}</td>
                        <td><span class="badge ${statusBadgeColor} px-2 py-2 w-100">${ag.status.toUpperCase()}</span></td>
                        <td>${botaoAcao}</td>
                    </tr>`;
            });
            
            html += '</tbody></table></div>';
            listaAgendamentosDiv.innerHTML = html;
            
            // Aplica o Event Listener nos botões de cancelar renderizados acima
            document.querySelectorAll('.btn-cancelar').forEach(btn => {
                btn.addEventListener('click', function() {
                    agendamentoIdParaCancelar = this.getAttribute('data-id');
                    if (bootstrapModal) {
                        bootstrapModal.show(); // Abre o modal do Bootstrap
                    } else {
                        // Fallback caso o modal não exista na página atual
                        executarCancelamentoDireto(agendamentoIdParaCancelar, this);
                    }
                });
            });
            
        } catch (error) {
            listaAgendamentosDiv.innerHTML = '<div class="alert alert-danger">Erro de rede ao carregar a lista de agendamentos.</div>';
        }
    }

    // Ação acionada pelo clique no botão "Sim, cancelar" de dentro do Modal do Bootstrap
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', async function() {
            if (!agendamentoIdParaCancelar) return;
            
            try {
                const response = await fetch(`/api/cliente/cancelar/${agendamentoIdParaCancelar}`, {
                    method: 'POST'
                });
                const result = await response.json();
                
                if (result.ok) {
                    if (bootstrapModal) bootstrapModal.hide();
                    mostrarFeedback('✅ Agendamento cancelado com sucesso!', 'success');
                    carregarMeusAgendamentos();
                } else {
                    mostrarFeedback('❌ ' + result.erro, 'danger');
                }
            } catch (e) {
                mostrarFeedback('Erro de conexão com o servidor.', 'danger');
            }
        });
    }

    // Fallback de cancelamento via confirm nativo caso o Modal HTML não esteja presente
    async function executarCancelamentoDireto(id, btn) {
        if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
        const originalText = btn.innerText;
        btn.innerText = '...';
        btn.disabled = true;
        try {
            const response = await fetch(`/api/cliente/cancelar/${id}`, { method: 'POST' });
            const result = await response.json();
            if (result.ok) {
                mostrarFeedback('✅ Agendamento cancelado!', 'success');
                carregarMeusAgendamentos();
            } else {
                mostrarFeedback('❌ ' + result.erro, 'danger');
                btn.innerText = originalText;
                btn.disabled = false;
            }
        } catch (e) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    // Ouvinte do botão de atualizar (ícone de rotação)
    if (refreshBtn) {
        refreshBtn.addEventListener('click', carregarMeusAgendamentos);
    }

    // Execução automática inicial ao carregar o painel do cliente
    carregarMeusAgendamentos();
});