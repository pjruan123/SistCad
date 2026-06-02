// script.js - Lógica geral da Home do Cliente
document.addEventListener('DOMContentLoaded', function() {
    const listaAgendamentos = document.getElementById('listaAgendamentos');
    const feedbackDiv = document.getElementById('feedbackMessage');
    let agendamentoIdParaCancelar = null;

    // Vincula o Modal do Bootstrap
    const confirmModalEl = document.getElementById('confirmModal');
    const bootstrapModal = confirmModalEl ? new bootstrap.Modal(confirmModalEl) : null;

    if (listaAgendamentos) {
        listaAgendamentos.addEventListener('click', function(e) {
            const btnCancelar = e.target.closest('.btn-cancelar');
            if (!btnCancelar) return;

            // Coleta o ID cadastrado no botão clicado
            agendamentoIdParaCancelar = btnCancelar.getAttribute('data-id');
            if (bootstrapModal) {
                bootstrapModal.show();
            }
        });
    }

    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', async function() {
            if (!agendamentoIdParaCancelar) return;

            confirmCancelBtn.disabled = true;
            confirmCancelBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processando...';

            try {
                const response = await fetch(`/cliente/cancelar/${agendamentoIdParaCancelar}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                const result = await response.json();

                if (result.ok) {
                    if (bootstrapModal) bootstrapModal.hide();
                    if (feedbackDiv) {
                        feedbackDiv.innerHTML = '<div class="alert alert-success rounded-pill text-center">✅ Agendamento cancelado com sucesso!</div>';
                    }
                    setTimeout(() => location.reload(), 1000);
                } else {
                    alert('Erro ao cancelar: ' + result.erro);
                    confirmCancelBtn.disabled = false;
                    confirmCancelBtn.innerText = 'Confirmar Cancelamento';
                }
            } catch (err) {
                alert('Erro na comunicação com o servidor.');
                confirmCancelBtn.disabled = false;
                confirmCancelBtn.innerText = 'Confirmar Cancelamento';
            }
        });
    }
});