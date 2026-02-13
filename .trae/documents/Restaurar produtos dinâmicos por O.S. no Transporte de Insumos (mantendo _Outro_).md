## Problema
- No cadastro de Transporte de Insumos, os selects de Produto estão fixos no HTML do formulário e da modal, não refletindo os itens da O.S.
- Na modal já há atualização dinâmica pelo O.S., porém o preenchimento substitui as opções e pode remover "Outro (digitar)".

## Objetivo
- Voltar ao comportamento dinâmico: produtos do select devem ser os da O.S. escolhida.
- Manter a opção "Outro (digitar)" sempre disponível, como está hoje.

## Mudanças Técnicas
- Modal (já dinâmico):
  - Ajustar a população de #modal-viagem-produto para sempre incluir "Selecione" e "Outro" após inserir os produtos da O.S.
  - Local: [app.js:L7122-L7129](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7122-L7129).
- Formulário principal (atual fixo):
  - Adicionar listener em #viagem-adubo-os para popular #viagem-produto com os produtos da O.S. selecionada.
  - Sempre incluir "Selecione" e "Outro". Se a O.S. não tiver produtos, manter a lista fixa atual + "Outro".
  - Local base do listener: [app.js:L7133-L7143](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7133-L7143).
  - Lista fixa atual está em: [index.html:L825-L842](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/index.html#L825-L842) e na modal: [index.html:L2287-L2304](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/index.html#L2287-L2304).
- Reuso da lógica "Outro":
  - Manter o handler existente que pede nome e justificativa e adiciona o item dinâmico no select.
  - Local: [app.js:L6770-L6809](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L6770-L6809).
- Sincronização com produção:
  - Replicar as alterações em docs/ (HTML e app.js), conforme regra de sincronização.

## Validação
- Selecionar uma O.S. com produtos diferentes e verificar se os selects mostram exatamente os itens da O.S. + "Outro".
- Testar fluxo "Outro": digitar nome e justificativa; confirmar que o item entra no select e é persistido.
- Testar caso sem O.S./sem produtos: mostrar lista fixa + "Outro".

## Confirmação
- Posso aplicar essas alterações para restaurar a lista dinâmica por O.S., mantendo "Outro" como opção permanente?