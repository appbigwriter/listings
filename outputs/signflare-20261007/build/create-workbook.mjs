import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
import { products, source } from './catalog-data.mjs';
const out=path.resolve(import.meta.dirname,'..');
const wb=Workbook.create();
const ps=wb.worksheets.add('Produtos'), cs=wb.worksheets.add('Custos'), gs=wb.worksheets.add('Guia');
const col=i=>String.fromCharCode(65+i);
function setup(s,title,note,headers,rows,widths,height){
 const end=rows.length+5,last=col(headers.length-1);
 s.showGridLines=false;
 s.getRange(`A1:${last}${end}`).format.font={name:'Arial',size:11,color:'#172033'};
 s.getRange('A1').values=[[title]];s.getRange('A1').format.font={name:'Arial',size:18,bold:true,color:'#172033'};
 s.getRange('A1').format.rowHeightPx=32;
 s.getRange('A2').values=[[note]];s.getRange('A2').format.rowHeightPx=24;
 s.getRange(`A3:${last}3`).format.borders={bottom:{style:'thin',color:'#D5DCE8'}};
 s.getRange(`A5:${last}${end}`).values=[headers,...rows];
 s.getRange(`A5:${last}5`).format={fill:'#172033',font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},wrapText:true,verticalAlignment:'center',rowHeightPx:44};
 s.getRange(`A6:${last}${end}`).format.wrapText=true;s.getRange(`A6:${last}${end}`).format.verticalAlignment='top';
 s.getRange(`A6:${last}${end}`).format.rowHeightPx=height;
 widths.forEach((w,i)=>s.getRange(`${col(i)}1:${col(i)}${end}`).format.columnWidthPx=w);
 for(let r=6;r<=end;r+=2)s.getRange(`A${r}:${last}${r}`).format.fill='#F3F5F8';
 s.tables.add(`A5:${last}${end}`,true,s.name+'Table').showFilterButton=true;
 if(s!==gs){s.freezePanes.freezeRows(5);s.freezePanes.freezeColumns(2);}
}
setup(ps,'Produtos','SignFlare — Amazon US — 24 propostas. Amarelo: campos para trabalhar. Preços sugeridos são hipóteses em USD.',
 ['SKU proposto','Produto em inglês','Coleção','Etapa sugerida','Status','Responsável','Fornecedor','Prazo','Especificação proposta','Preço sugerido mín. USD','Preço sugerido máx. USD','Envio proposto','Evidência de procura','Validar antes de produzir','Observações','Fonte da procura'],
 products.map(p=>[p.sku,p.name,p.collection,p.phase,'A avaliar',null,null,null,p.spec,p.priceLow,p.priceHigh,p.fulfillment,p.evidence,p.validation,null,p.sourceKey?source[p.sourceKey]:source.explorer]),
 [110,260,110,130,160,160,210,120,350,135,135,290,160,400,340,390],104);
ps.getRange('E6:H29').format.fill='#FFF3D1';ps.getRange('O6:O29').format.fill='#FFF3D1';
ps.getRange('H6:H29').setNumberFormat('yyyy-mm-dd');ps.getRange('J6:K29').setNumberFormat('"$"#,##0.00');
ps.getRange('E6:E29').dataValidation={rule:{type:'list',values:['A avaliar','Em pesquisa','Em cotação','Em amostra','Pronto para lançar','Publicado','Pausado','Descartado']}};
ps.getRange('D6:D29').dataValidation={rule:{type:'list',values:['Piloto','Expansão','Condicional']}};
setup(cs,'Custos','USD por unidade vendável (kit quando aplicável). Preencha os campos amarelos; use 0 para custo inexistente.',
 ['SKU proposto','Produto em inglês','Preço de venda USD','Fabricação USD','Embalagem USD','Frete de entrada USD','Logística de saída USD','Comissão Amazon %','Publicidade % da receita','Outros custos / perdas USD','Custos diretos USD','Comissão USD','Publicidade USD','Contribuição USD','Margem de contribuição %','Observações'],
 products.map(p=>[p.sku,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]),
 [110,260,125,125,125,130,135,125,140,135,125,125,125,140,145,340],60);
cs.getRange('C6:J29').format.fill='#FFF3D1';cs.getRange('P6:P29').format.fill='#FFF3D1';
cs.getRange('C6:G29').setNumberFormat('"$"#,##0.00');cs.getRange('J6:N29').setNumberFormat('"$"#,##0.00');cs.getRange('H6:I29').setNumberFormat('0.0%');cs.getRange('O6:O29').setNumberFormat('0.0%');
const formulas=products.map((_,i)=>{const r=i+6;return [
 `=IF(COUNT(D${r}:G${r},J${r})<5,"",SUM(D${r}:G${r},J${r}))`,
 `=IF(COUNT(C${r},H${r})<2,"",IF(C${r}<=0,"",C${r}*H${r}))`,
 `=IF(COUNT(C${r},I${r})<2,"",IF(C${r}<=0,"",C${r}*I${r}))`,
 `=IF(COUNT(C${r},K${r}:M${r})<4,"",IF(C${r}<=0,"",C${r}-SUM(K${r}:M${r})))`,
 `=IF(N${r}="","",N${r}/C${r})`
 ];});
cs.getRange('K6:O29').formulas=formulas;
cs.getRange('B6:B29').formulas=products.map((_,i)=>[`=INDEX('Produtos'!$B$6:$B$29,MATCH(A${i+6},'Produtos'!$A$6:$A$29,0))`]);
cs.getRange('O6:O29').conditionalFormats.add('cellIs',{operator:'lessThan',formula:0,format:{font:{color:'#B42318'},fill:'#FEE4E2'}});
const guide=[
 ['Uso','Aba Produtos: filtre a lista, atualize status, responsável, fornecedor, prazo e observações. Aba Custos: simule cada configuração antes de produzir.'],
 ['Cores','Amarelo indica campos editáveis de operação ou custo. Demais dados também podem ser alterados; as colunas K:O de Custos contêm fórmulas.'],
 ['Identificação','Use o SKU como chave. O nome em Custos é buscado pelo SKU na aba Produtos, permitindo ordenar as tabelas separadamente.'],
 ['Unidade de venda','Informe preço e custos por unidade vendável. Para um kit com duas placas, todos os valores devem corresponder ao kit completo.'],
 ['Custos em branco','Os custos reais não foram disponibilizados. Não foram preenchidos com estimativas. Digite 0 quando um item de custo não se aplicar. Sem todos os campos C:J, a margem permanece vazia.'],
 ['Preço','As faixas na aba Produtos são hipóteses da proposta original. O preço efetivo é informado separadamente na coluna C de Custos. Preço zero ou negativo não calcula margem.'],
 ['Frete e logística','Frete de entrada é o custo por unidade para trazer o produto ao estoque/centro de distribuição. Logística de saída inclui fulfillment FBA ou frete FBM. Evite lançar o mesmo custo duas vezes.'],
 ['Comissão e publicidade','Digite percentuais como 15% ou 0,15, conforme a configuração regional do Excel. Comissão e publicidade são calculadas sobre o preço informado. Preço pressupõe receita da unidade, sem cobrança de frete ao cliente.'],
 ['Outros custos / perdas','Inclua provisões por unidade para devoluções, impostos aplicáveis e demais despesas variáveis não registradas nas outras colunas.'],
 ['Contribuição','Preço de venda menos fabricação, embalagem, fretes, logística, comissão, publicidade e outros custos/perdas. A margem é contribuição dividida pelo preço. Não representa lucro líquido nem desconta custos fixos.'],
 ['Personalizados','Amazon Custom exige envio pelo vendedor (FBM). Avalie FBA para os produtos padrão conforme pacote, dimensões e tarifas reais.'],
 ['Procura','Evidências vêm da pesquisa preliminar anterior. Nicho estimado não confirma venda de um novo SKU; nicho adjacente exige pesquisa específica; procura não medida deve ser validada.'],
 ['Origem da lista','Relatório SignFlare de 07/10/2026: 24 configurações, sendo 8 pilotos, 12 expansões e 4 condicionais.'],
 ['Catálogo FBR',source.fbr],
 ['Pesquisa oficial Amazon',source.explorer],
 ['Regras Amazon Custom',source.custom],
 ['Tarifas Amazon',source.fees]
];
setup(gs,'Guia','Como preencher a planilha de produtos e custos.', ['Tema','Orientação / fonte'],guide,[245,850],64);
// Exercise the first and last calculation rows, then remove every test input.
for(const r of [6,29]){
 cs.getRange(`C${r}:J${r}`).values=[[25,5,1,2,3,0.15,0.10,0.5]];
 const v=cs.getRange(`K${r}:O${r}`).values[0];
 const expected=[11.5,3.75,2.5,7.25,0.29];
 if(v.some((x,i)=>Math.abs(x-expected[i])>1e-8))throw Error(`Cálculo divergente na linha ${r}: ${JSON.stringify(v)}`);
 cs.getRange(`C${r}:J${r}`).clear({applyTo:'contents'});
 if(cs.getRange(`O${r}`).values[0][0]!=='')throw Error('Custo em branco deve deixar a margem vazia');
}
cs.getRange('C6:J6').values=[[0,5,1,2,3,0.15,0.10,0.5]];
if(cs.getRange('O6').values[0][0]!=='')throw Error('Preço zero deve deixar a margem vazia');
cs.getRange('C6:J6').clear({applyTo:'contents'});
console.log((await wb.inspect({kind:'table',range:'Produtos!A5:F9',include:'values',tableMaxRows:5,tableMaxCols:6,maxChars:2000})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'Erros de fórmula',maxChars:1200})).ndjson);
for(const [name,range,file] of [['Produtos','A1:F10','produtos-trabalho'],['Custos','A1:J10','custos-trabalho'],['Guia','A1:B12','guia-trabalho']]){
 const p=await wb.render({sheetName:name,range,scale:1,format:'png'});
 await fs.writeFile(path.join(out,'build',file+'.png'),new Uint8Array(await p.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(out,'SignFlare-Produtos-Trabalho.xlsx'));
console.log('Exportado: SignFlare-Produtos-Trabalho.xlsx; 24 produtos; fórmulas verificadas; dados de teste removidos.');
