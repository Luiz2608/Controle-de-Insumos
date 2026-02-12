## Objetivo
- Permitir selecionar "Outro" como produto na Viagem de Adubo e coletar justificativa.
- Habilitar edição de lacre em Bags e marcar se o lacre foi devolvido ao controle.

## Produto "Outro" + Justificativa
- UI: adicionar opção "Outro" ao select de produto do modal de Viagem Adubo [index.html](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/index.html#L2287-L2304).
- Interação: ao selecionar "Outro", abrir pop-up (modal leve) com campo texto obrigatório para justificativa.
- Persistência: incluir campos no payload da viagem: `produto="OUTRO"`, `produto_outro_descricao` (texto digitado) e `produto_outro_justificativa`.
- Pontos de código:
  - Abrir/Reset modal: [openViagemAduboModal](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L6718-L6831)
  - Preenchimento de selects: [populateViagemAduboSelects](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L6897-L6918)
  - Validação/submit: onde monta o payload da viagem (usa `viagensAduboBagsDraft`) [app.js](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L12484)
- UX: usar padrão de confirmação/alerta já existente, mantendo identidade visual; modal simples sem alterar `main.css` (<mccoremem id="03fhr8nao86e21pmki9q04pbl|03fhsfazkoqy1esk31zudse89" />).

## Bags: editar lacre + marcar devolvido
- Renderização atual de Bags (draft e detalhes):
  - Draft render: [renderBagsDraft](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7806-L7834)
  - Adição bag: [addBagRow](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7787-L7804)
  - Delegação de eventos (excluir): [tbody handlers](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L6675-L6704)
  - Detalhes/visualização: [openViagemDetail](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/frontend/app.js#L7836-L7910)
- Alterações:
  - Adicionar botão "✏️" por linha; ao clicar, mostrar inputs inline para editar `lacre` e `observacoes` com salvar/cancelar.
  - Incluir nova coluna "Devolvido" com checkbox; armazenar `devolvido: true|false` em cada item do draft.
  - Exibir coluna "Devolvido" na modal de detalhes (somente leitura).
- Persistência: `bags` é JSONB e aceita campos extras; backend já repassa payload:
  - Backend server: [server.js](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/backend/server.js#L703-L776)
  - Schema: [supabase_schema.sql](file:///c:/Users/Luiz%20Eduardo/Documents/trae_projects/Controle-de-Insumos/backend/supabase_schema.sql#L103)

## Validações
- Justificativa obrigatória quando `produto=OUTRO`; bloquear submit sem justificativa.
- Manter filtros por lacre funcionando; incluir devolvido no draft não muda busca por lacre.

## Sincronização Frontend/Docs
- Replicar todas alterações em `frontend/` e `docs/` conforme regra de produção (<mccoremem id="03fjgqvkdd4re2smqr128niex" />).

## Testes
- Abrir modal de Viagem Adubo, selecionar "Outro" → pop-up de justificativa.
- Adicionar bag, editar lacre/observação e marcar "Devolvido"; salvar viagem.
- Checar detalhes: coluna "Devolvido" aparecendo; lacre editado refletido.
- Servir em `docs/` e validar UI sem regressão de CSS.