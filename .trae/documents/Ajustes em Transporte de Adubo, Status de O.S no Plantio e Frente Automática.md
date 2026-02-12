## Transporte de Adubo — Remover "Ações" em Detalhes
- Remover apenas no modal de detalhes dos Bags a coluna de cabeçalho "Ações" em [index.html](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/index.html#L2378-L2386).
- Ajustar a renderização das linhas para não criar a célula de ações quando em modo de visualização (isViewMode) em [app.js](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7893-L7909).
- Manter intactas outras visões/edições de Bags; alterar somente o modal de detalhes do Transporte de Adubo.

## Plantio — Campo de Status da O.S (Aberta/Fechada)
- Padronizar o campo de status da O.S como seletor com valores "Aberta" e "Fechada" no formulário em [index.html](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/index.html#L1198-L1201).
- Garantir persistência via API existente (tabela os_agricola.status) em [api.js](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/api.js#L1476-L1507).
- Ajustar mapeamento visual de status (cores/badge) em [getStatusClass](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js#L4655-L4662).

## Plantio — Exibir Status no Preview e Detalhes
- Incluir em cada registro de plantio o vínculo com a O.S selecionada: salvar osNumero e osStatus dentro de cada frente em [savePlantioDia](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js#L12354-L12363).
- Exibir "Nº OS" e "Status OS" nas tabelas/seções do preview e detalhes em [getPlantioDetailsHTML](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js#L6355-L6419).

## Plantio — Filtrar O.S Fechadas dos Selects Dependentes
- No preenchimento do select de O.S do "Novo Plantio" (single-os), filtrar para mostrar somente O.S com status "Aberta" em [app.js](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js#L5452-L5481).
- Regra: O.S "Fechada" não aparece para seleção em fluxos que dependem do número da O.S.

## Viagens de Adubo — Frente Automática pela O.S
- Remover opções hardcoded (4001, 4002, 4009 Abençoada) dos selects de Frente em [index.html](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/index.html#L2255-L2265) e usar população dinâmica.
- Assegurar que ao selecionar a O.S, a Frente seja automaticamente definida a partir da O.S em ambos contextos (modal e formulário principal) usando o listener existente/replicado em [app.js](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7049-L7071).

## Verificação e Sincronização
- Aplicar as mesmas alterações na pasta de produção `docs/` após ajustar `frontend/` para manter paridade.<mccoremem id="03fjgqvkdd4re2smqr128niex" />
- Garantir que o layout/estilo visual permaneça inalterado, evitando regressões de identidade visual.<mccoremem id="03fhr8nao86e21pmki9q04pbl" />
- Validar: preview/detalhes de Plantio mostram status; selects do Novo Plantio não exibem O.S fechadas; detalhes dos Bags sem coluna "Ações"; Frente em Viagens de Adubo é autodefinida pela O.S.

Confirma seguir com esse plano (aplicando em `frontend/` e sincronizando para `docs/`)?