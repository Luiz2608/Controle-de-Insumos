## Diagnóstico
- O select de Frente é populado a partir de plantio_diario com options no formato value=nome e texto=nome, sem data-atributos. Veja [app.js:L7014-L7046](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7014-L7046) e [index.html:L2279-L2296](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/index.html#L2279-L2296).
- O preenchimento atual usa atribuição direta: elFrente.value = os.frente. Se não houver option com value exatamente igual à string da OS, nada é selecionado. Veja [app.js:L7068-L7081](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7068-L7081).

## Ajustes Propostos
1. Normalizar e buscar por texto/valor:
- Implementar uma rotina de seleção que compara por value e por texto das options usando normalização (trim, maiúsculas, remoção de acentos) e correspondência exata ou parcial.
- Campos alvo da OS: tentar em ordem os.frente, os.frente_nome (se existir).

2. Garantir ordem de carregamento:
- Confirmar que o select de Frente está populado antes de executar a seleção ao mudar a OS. Se necessário, aguardar/popular frentes antes de aplicar a lógica de match.

3. Fallbacks e segurança:
- Se não houver correspondência, manter "Selecione".
- Não alterar estilos/identidade visual.

4. Replicação em produção:
- Aplicar a mesma lógica em [docs/app.js](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js) no listener de mudança da OS.

## Implementação (sem comentários)
- Substituir a linha de atribuição direta pelo algoritmo:
  - const elFrente = document.getElementById('modal-viagem-frente');
  - const target = os.frente || os.frente_nome || '';
  - const norm = s => s ? s.toString().trim().toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') : '';
  - Percorrer options e selecionar o primeiro que case por value/text (igualdade ou includes) com norm(target).

## Validação
- Abrir modal "Nova Viagem" (Adubo), selecionar diferentes O.S. e confirmar que Frente é preenchida automaticamente quando existir na lista.
- Verificar casos sem match: Frente permanece "Selecione".
- Confirmar que Fazenda e Código continuam funcionando.

## Arquivos afetados
- [frontend/app.js](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7068-L7081)
- [docs/app.js](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js)

Confirma que posso aplicar os ajustes descritos?