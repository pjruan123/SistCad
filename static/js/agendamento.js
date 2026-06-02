// agendamento.js - Lógica do calendário e horários
(function() {
    const diasGrid = document.getElementById('diasGrid');
    const mesAnoEl = document.getElementById('mesAno');
    const horariosContainer = document.getElementById('horariosContainer');
    const procedimentoSelect = document.getElementById('procedimentoSelect');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    const hoje = new Date();
    let mesAtual = hoje.getMonth();
    let anoAtual = hoje.getFullYear();
    let dataSelecionada = null;

    const meses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    function formatDate(year, month, day) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function atualizarCalendario() {
        diasGrid.innerHTML = '';
        mesAnoEl.textContent = `${meses[mesAtual]} de ${anoAtual}`;

        const primeiroDia = new Date(anoAtual, mesAtual, 1).getDay();
        const ultimoDia = new Date(anoAtual, mesAtual + 1, 0).getDate();
        const hojeDate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

        for (let i = 0; i < primeiroDia; i++) {
            const div = document.createElement('div');
            div.className = 'dia-btn vazio';
            diasGrid.appendChild(div);
        }

        for (let dia = 1; dia <= ultimoDia; dia++) {
            const dataAtual = new Date(anoAtual, mesAtual, dia);
            const dataStr = formatDate(anoAtual, mesAtual, dia);
            const btn = document.createElement('div');
            btn.textContent = dia;
            btn.className = 'dia-btn';

            if (dataAtual < hojeDate || dataAtual.getDay() === 0) {
                btn.classList.add('desabilitado');
            } else {
                btn.addEventListener('click', () => {
                    if (!procedimentoSelect.value) {
                        alert("Escolha um procedimento primeiro.");
                        return;
                    }
                    document.querySelectorAll('.dia-btn.selecionado').forEach(b => b.classList.remove('selecionado'));
                    btn.classList.add('selecionado');
                    dataSelecionada = dataStr;
                    carregarHorarios(dataStr);
                });
            }
            diasGrid.appendChild(btn);
        }
    }

    function carregarHorarios(data) {
        const procedimento = procedimentoSelect.value;
        horariosContainer.innerHTML = '<p class="msg-sem-horarios">Buscando horários...</p>';

        fetch(`/api/horarios?data=${data}`)
            .then(res => res.json())
            .then(resp => {
                if (!resp.ok || !resp.horarios.length) {
                    horariosContainer.innerHTML = '<p class="msg-sem-horarios">Nenhum horário disponível.</p>';
                    return;
                }

                let html = '<div class="horarios-lista">';
                resp.horarios.forEach(h => {
                    html += `
                        <form class="form-reservar" method="post" action="/agendamento/reservar" style="display:inline-block; margin:4px;">
                            <input type="hidden" name="data" value="${data}">
                            <input type="hidden" name="horario" value="${h}">
                            <input type="hidden" name="procedimento" value="${procedimento}">
                            <button type="submit" class="horario-btn">${h}</button>
                        </form>
                    `;
                });
                html += '</div>';
                horariosContainer.innerHTML = html;

                document.querySelectorAll('.form-reservar').forEach(form => {
                    form.addEventListener('submit', async function(e) {
                        e.preventDefault();
                        const response = await fetch('/agendamento/reservar', {
                            method: 'POST',
                            body: new FormData(this)
                        });
                        if (response.ok) {
                            horariosContainer.innerHTML = '<div class="alert alert-success">Agendado com sucesso! Redirecionando...</div>';
                            setTimeout(() => window.location.href = '/', 1200);
                        } else {
                            alert('Erro na reserva.');
                        }
                    });
                });
            });
    }

    prevMonthBtn.addEventListener('click', () => { mesAtual--; atualizarCalendario(); });
    nextMonthBtn.addEventListener('click', () => { mesAtual++; atualizarCalendario(); });
    procedimentoSelect.addEventListener('change', () => { if(dataSelecionada) carregarHorarios(dataSelecionada); });

    atualizarCalendario();
})();