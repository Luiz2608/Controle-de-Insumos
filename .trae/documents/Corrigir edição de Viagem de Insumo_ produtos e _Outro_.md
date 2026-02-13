## Problema
- Ao editar uma Viagem de Insumo, o select de Produto não reflete os itens da O.S. da viagem e/ou perde o item personalizado inserido via "Outro".

## Objetivo
- Na edição, carregar os produtos da O.S. associada à viagem e manter sempre a opção "Outro (digitar)".
- Se o produto salvo não estiver na lista da O.S., adicioná-lo dinamicamente para exibição correta.
- Preencher os campos ocultos de "Outro" (descrição/justificativa) quando existirem.

## Mudanças Técnicas
- Em openViagemAduboModal (modo edit):
  - Após populateViagemAduboSelects e preenchimento dos campos, localizar a O.S. pelo item.numeroOS e popular #modal-viagem-produto com os produtos da O.S. + "Selecione" + "Outro".
  - Garantir que item.produto esteja presente: se não estiver na lista gerada, adicionar um <option> com o valor do item e selecionar.
  - Preencher hidden fields: #modal-viagem-produto-outro e #modal-viagem-produto-justificativa com item.produto_outro_descricao e item.produto_outro_justificativa.
- Replicar o mesmo comportamento em docs/app.js.

## Validação
- Editar uma viagem com produto vindo da O.S.: select mostra itens da O.S. e seleciona corretamente o produto.
- Editar uma viagem com produto "Outro": select mostra o item personalizado e hidden fields aparecem preenchidos.
- Editar uma viagem sem produtos definidos na O.S.: mantém lista padrão, preserva "Outro" e seleção do produto salvo.

## Confirmação
- Posso aplicar essas alterações no frontend e docs para corrigir o fluxo de edição?