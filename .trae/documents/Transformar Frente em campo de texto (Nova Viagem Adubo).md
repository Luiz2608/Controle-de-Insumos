## Objetivo
Trocar o campo Frente de select para entrada de texto tanto no formulário principal quanto na modal de Nova Viagem (Adubo), mantendo o auto-preenchimento pela O.S. e a possibilidade de edição manual.

## Locais a alterar
- HTML (desenvolvimento):
  - [frontend/index.html:L803-L806](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/index.html#L803-L806)
  - [frontend/index.html:L2264-L2267](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/index.html#L2264-L2267)
- HTML (produção):
  - [docs/index.html:L803-L806](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/index.html#L803-L806)
  - [docs/index.html:L2263-L2266](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/index.html#L2263-L2266)
- JS (desenvolvimento):
  - Remover/popular frentes (lista) em [app.js:L7033-L7045](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7033-L7045)
  - Listener da O.S. para Frente em [app.js:L7069-L7096](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7069-L7096) e ajuste do principal em [app.js:L7182-L7186](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7182-L7186)
- JS (produção):
  - Remover/popular frentes (lista) em [app.js:L7010-L7022](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js#L7010-L7022)
  - Listener da O.S. para Frente em [app.js:L7046-L7058](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js#L7046-L7058) e ajuste do principal em [app.js:L7142-L7146](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js#L7142-L7146)

## Ajustes detalhados
1. HTML: substituir o select por input texto
- Onde houver `<select id="viagem-frente">` e `<select id="modal-viagem-frente">`, trocar por `<input type="text" id="..." class="form-control" placeholder="Digite a Frente">`.

2. JS: remover lógica de options e seleção
- Eliminar a construção de `frentesHtml` e a atribuição de `innerHTML` para os IDs de Frente.
- No listener de mudança da O.S., trocar a lógica de match por:
  - `elFrente.value = os.frente || os.frente_nome || ''` (campo fica livre para edição).
- No listener do formulário principal (quando seleciona O.S. fora da modal), aplicar a mesma atribuição simples ao `viagem-frente`.

3. Payloads
- Nenhuma mudança: o envio já lê `.value` de Frente conforme referências [frontend/app.js:L7519](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7519) e [docs/app.js:L7498](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/docs/app.js#L7498).

## Validação
- Abrir a modal “Nova Viagem”, selecionar uma O.S.: verificar que o campo Frente é preenchido com texto e pode ser editado.
- Confirmar que Fazenda e Código continuam funcionando.
- Executar verificação de erros (diagnósticos) após alterações.

## Sincronização
- Replicar ajustes em `docs/` (produção) conforme regra de sincronização.

Se aprovado, aplico as mudanças nos quatro arquivos e valido em seguida.