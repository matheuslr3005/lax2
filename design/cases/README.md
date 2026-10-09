# Cards de resultado por segmento

Os quatro cards do bloco **Resultados por segmento** (Eventos, Esportivo, Energia Solar, Estética) são gerados a partir de `cases.json`.

Os números em `cases.json` são aproximados (já reduzidos em relação aos originais) e os cards trazem "Valores aproximados" no rodapé.

## Trocar os números

1. Edite os valores em `cases.json` (já no formato que aparece no card, por exemplo `"4.006.507"`). `money: true` coloca o "R$" antes do número.
2. Gere de novo:

```
cd design/cases
npm i playwright @fontsource-variable/archivo @fontsource/jetbrains-mono
node render.js
```

O script escreve os PNGs em `out/` (1080x1350, prontos pra postar) e as versões `.webp` usadas no site em `assets/img/cases/` (precisa do `ffmpeg` instalado para o `.webp`).

Se tirar os "Valores aproximados" depois de trocar pelos números reais, edite o rodapé em `card.html`.
