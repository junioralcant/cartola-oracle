# Plano de Implementação: Backlog em Tasks Menores com APIs e Exemplos

## Resumo

Dividir a implementação em 8 tasks sequenciais e testáveis, começando pela fundação do app e contratos, depois integração com APIs, domínio de score,
algoritmo de montagem e por fim UI e validação final.

O plano abaixo já inclui exemplos de como chamar cada API do Cartola, exemplos resumidos de resposta e o papel de cada endpoint dentro do fluxo da
aplicação.

## Tasks

### Task 1: Bootstrap do projeto Next.js

- Criar a base do app com Next.js + TypeScript + App Router.
- Definir estrutura inicial de pastas:
  - app/
  - lib/cartola-api/
  - lib/domain/
  - lib/optimizer/
  - lib/utils/
- Configurar lint, scripts de dev/build/test e variáveis de ambiente.
- Critério de pronto:
  - projeto sobe localmente
  - página inicial renderiza
  - pipeline básica de teste roda

### Task 2: Modelagem de tipos e contratos internos

- Criar os tipos de entrada e saída da geração de time.
- Modelar entidades normalizadas:
  - CartolaMarketStatus
  - CartolaAthlete
  - CartolaCoach
  - CartolaClub
  - CartolaMatch
  - LastRoundScore
  - GeneratedLineup
- Definir enum/mapa de posições e formações suportadas.
- Definir contrato do otimizador:
  - generateLineup(input): GeneratedLineup
- Definir também o contrato da rota interna:

{
"budget": 120.5,
"formation": "4-3-3"
}

- Exemplo de resposta interna:

{
"marketRound": 5,
"marketStatus": "open",
"lineup": {
"players": [],
"coach": {}
},
"summary": {
"formation": "4-3-3",
"totalCost": 118.3,
"remainingBudget": 2.2,
"totalScore": 79.54
},
"warnings": [],
"explanations": []
}

- Critério de pronto:
  - tipos cobrem todos os endpoints e a resposta final da app
  - formações suportadas estão fechadas em constante única

### Task 3: Cliente das APIs do Cartola

- Implementar cliente HTTP para os endpoints públicos.
- Adicionar parsing, validação mínima e tratamento de erro por endpoint.
- Criar normalizadores para transformar resposta externa em modelo interno estável.
- Definir política de fallback por fonte de dados.

#### API 1: Status do mercado

- Chamada:

curl -X GET "https://api.cartola.globo.com/mercado/status"

- Uso:
  - descobrir rodada_atual
  - validar status_mercado
- Resposta esperada:

{
"rodada_atual": 5,
"status_mercado": 1,
"esquema_default_id": 4
}

- Campos mínimos consumidos:
  - rodada_atual
  - status_mercado

#### API 2: Atletas disponíveis

- Chamada:

curl -X GET "https://api.cartola.globo.com/atletas/mercado"

- Uso:
  - listar atletas
  - obter preço, média, posição, clube e dados-base do score
- Resposta esperada:

{
"atletas": [
{
"atleta_id": 123,
"apelido": "Pedro",
"posicao_id": 4,
"clube_id": 10,
"preco_num": 12.5,
"media_num": 6.3,
"pontos_num": 8.2,
"scout": {
"G": 1,
"A": 1
}
}
],
"clubes": {
"10": {
"nome": "Flamengo",
"abreviacao": "FLA"
}
}
}

- Campos mínimos consumidos:
  - atleta_id
  - apelido
  - posicao_id
  - clube_id
  - preco_num
  - media_num
  - pontos_num
  - scout

#### API 3: Pontuação da última rodada

- Exemplo para a rodada 4:

curl -X GET "https://api.cartola.globo.com/atletas/pontuados/4"

- Uso:
  - enriquecer desempenho recente
  - compor justificativa
- Resposta esperada:

{
"atletas": {
"123": {
"pontuacao": 8.2,
"scout": {
"G": 1,
"A": 1
}
}
}
}

- Campos mínimos consumidos:
  - atletas[id].pontuacao
  - atletas[id].scout

#### API 4: Partidas da rodada atual

- Chamada:

curl -X GET "https://api.cartola.globo.com/partidas"

- Uso:
  - identificar confrontos
  - saber mando de campo
  - calcular força relativa do confronto
- Resposta esperada:

{
"partidas": [
{
"clube_casa_id": 10,
"clube_visitante_id": 20,
"partida_data": "2026-04-01",
"local": "Maracana"
}
]
}

- Campos mínimos consumidos:
  - clube_casa_id
  - clube_visitante_id
  - partida_data
  - local

#### API 5: Clubes

- Chamada:

curl -X GET "https://api.cartola.globo.com/clubes"

- Uso:
  - fallback para nomes e siglas dos clubes
- Resposta esperada:

{
"10": {
"nome": "Flamengo",
"abreviacao": "FLA"
}
}

- Campos mínimos consumidos:
  - nome
  - abreviacao
- Critério de pronto:
  - cada endpoint possui função dedicada
  - respostas são normalizadas para o domínio
  - falhas retornam erro ou warning conforme regra definida

### Task 4: Serviço agregador de contexto da rodada

- Criar um serviço que:
  - busca mercado/status
  - identifica rodada_atual e ultima_rodada
  - busca as demais fontes em paralelo
  - monta PlayerContext
- Consolidar warnings de dados faltantes.
- Garantir que os consumidores do domínio recebam um contexto único já pronto.

#### Exemplo de sequência de chamadas

1. Buscar status:

curl "https://api.cartola.globo.com/mercado/status"

2. Ler rodada_atual = 5
3. Calcular ultima_rodada = 4
4. Buscar em paralelo:

curl "https://api.cartola.globo.com/atletas/mercado"
curl "https://api.cartola.globo.com/atletas/pontuados/4"
curl "https://api.cartola.globo.com/partidas"
curl "https://api.cartola.globo.com/clubes"

#### Exemplo do contexto agregado interno

{
"marketRound": 5,
"marketStatus": "open",
"players": [
{
"id": 123,
"name": "Pedro",
"position": "ATA",
"clubId": 10,
"club": "FLA",
"price": 12.5,
"averageScore": 6.3,
"lastRoundScore": 8.2,
"isHome": true,
"opponentClubId": 20
}
],
"warnings": []
}

- Critério de pronto:
  - uma única função entrega os dados necessários para score e otimização
  - cenários de fallback já chegam resolvidos ao domínio

### Task 5: Engine de score

- Implementar calculatePlayerScore(player, context).
- Implementar calculateCoachScore(coach, context).
- Definir pesos configuráveis para:
  - última rodada
  - média
  - custo-benefício
  - confronto
  - força do clube
  - mando
- Gerar justificativa textual curta baseada nos fatores dominantes do score.

#### Exemplo de entrada para score do jogador

{
"id": 123,
"name": "Pedro",
"position": "ATA",
"club": "FLA",
"price": 12.5,
"averageScore": 6.3,
"lastRoundScore": 8.2,
"isHome": true,
"opponentStrength": 0.4,
"clubStrength": 0.8
}

#### Exemplo de saída do score

{
"id": 123,
"score": 8.91,
"justification": "Boa media recente, ultima rodada forte e confronto favoravel em casa."
}

- Critério de pronto:
  - todos os atletas elegíveis saem com score calculado
  - técnicos também
  - justificativas são coerentes com os fatores usados

### Task 6: Otimizador de escalação v1

- Implementar HeuristicLineupOptimizer.
- Regras obrigatórias:
  - respeitar orçamento
  - respeitar formação
  - incluir técnico
  - maximizar score total
- Estratégia da v1:
  - ranquear por posição
  - montar time inicial válido
  - ajustar para caber no orçamento
  - aplicar swaps de melhoria local
  - desempatar por maior uso do orçamento sem exceder
- Preparar interface para futura troca por solver mais exato.

#### Exemplo de chamada interna

generateLineup({
budget: 120.5,
formation: "4-3-3",
players: scoredPlayers,
coaches: scoredCoaches
});

#### Exemplo de saída do otimizador

{
"players": [
{
"id": 1,
"name": "Jogador A",
"position": "GOL",
"price": 9.5,
"score": 7.1
}
],
"coach": {
"id": 999,
"name": "Tecnico X",
"price": 8,
"score": 6.4
},
"totalCost": 118.3,
"totalScore": 79.54,
"remainingBudget": 2.2
}

- Critério de pronto:
  - gera escalação válida nos cenários normais
  - falha com erro funcional claro quando não houver solução

### Task 7: API interna e integração com UI

- Criar POST /api/lineup/generate.
- Validar budget e formation.
- Integrar:
  - agregador de contexto
  - engine de score
  - otimizador
- Retornar payload final com:
  - lineup
  - summary
  - warnings
  - explanations

#### Exemplo de chamada da rota interna

curl -X POST "http://localhost:3000/api/lineup/generate" \
 -H "Content-Type: application/json" \
 -d '{
"budget": 120.5,
"formation": "4-3-3"
}'

#### Exemplo de resposta de sucesso

{
"marketRound": 5,
"marketStatus": "open",
"lineup": {
"players": [
{
"id": 123,
"name": "Pedro",
"position": "ATA",
"club": "FLA",
"price": 12.5,
"score": 8.91,
"justification": "Boa media recente, confronto favoravel e alto custo-beneficio."
}
],
"coach": {
"id": 999,
"name": "Tecnico X",
"club": "FLA",
"price": 8.0,
"score": 6.4,
"justification": "Time forte, mando de campo e confronto acessivel."
}
},
"summary": {
"formation": "4-3-3",
"totalCost": 118.3,
"remainingBudget": 2.2,
"totalScore": 79.54
},
"warnings": [],
"explanations": [
"O time priorizou atletas com boa pontuacao recente e clubes favoritos na rodada."
]
}

#### Exemplo de resposta de falha funcional

{
"error": {
"code": "LINEUP_NOT_POSSIBLE",
"message": "Nao foi possivel montar um time valido com esse orçamento e formação."
},
"warnings": [
"Alguns dados contextuais nao estavam disponiveis e foram desconsiderados."
]
}

- Critério de pronto:
  - endpoint responde com sucesso e falha funcional/técnica em formato consistente
  - contrato estável para consumo da interface

### Task 8: Interface da aplicação

- Construir tela principal com:
  - input de cartoletas
  - seletor de formação
  - botão Gerar Time
- Implementar estados:
  - idle
  - loading
  - resultado
  - erro funcional
  - erro técnico
- Exibir:
  - 11 jogadores
  - técnico
  - posição, clube, preço, score e justificativa
  - custo total, saldo e score total
  - warnings

#### Exemplo de fluxo esperado na UI

1. Usuário informa:

{
"budget": 120.5,
"formation": "4-3-3"
}

2. Front chama:

POST /api/lineup/generate

3. UI recebe:

{
"summary": {
"totalCost": 118.3,
"remainingBudget": 2.2,
"totalScore": 79.54
}
}

4. UI renderiza cards/lista com elenco, técnico, justificativas e saldo

- Critério de pronto:
  - fluxo completo funciona da entrada ao resultado

## Testes por etapa

- Task 2:
  - testes de tipos utilitários e validação de formação
- Task 3:
  - testes de parsing/normalização por endpoint usando os exemplos acima como fixtures
- Task 4:
  - testes do agregador com combinações de sucesso e fallback
- Task 5:
  - testes unitários de score e justificativas
- Task 6:
  - testes do otimizador com orçamento, formação, desempate e ausência de solução
- Task 7:
  - testes de integração da rota interna com payloads de exemplo
- Task 8:
  - testes da UI com submit, loading, renderização e erros

## Assumptions

- As tasks são sequenciais, mas Task 5 e parte da Task 8 podem começar em paralelo depois que Task 4 estiver estável.
- A primeira versão do algoritmo continua sendo heurística forte, encapsulada para evolução futura.
- Os exemplos de resposta são resumidos e representam apenas os campos mínimos que a implementação precisa consumir.
- O parser deve tolerar campos extras e dados opcionais ausentes nas respostas da API pública.
