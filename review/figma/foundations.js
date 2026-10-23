const createdNodeIds=[];
const mutatedNodeIds=[];
const pageNames=['00 · Guide & design system','01 · Mobile app','02 · Admin panel'];
const pages={};
for(let i=0;i<pageNames.length;i++){
 let p=figma.root.children.find(p=>p.name===pageNames[i]);
 if(!p&&i===0){p=figma.root.children[0];p.name=pageNames[i];mutatedNodeIds.push(p.id);}
 if(!p){p=figma.createPage();p.name=pageNames[i];createdNodeIds.push(p.id);}
 pages[pageNames[i]]=p.id;
}
const primitives=figma.variables.createVariableCollection('MR · Primitives');
const colors=figma.variables.createVariableCollection('MR · Semantic colors');
const geometry=figma.variables.createVariableCollection('MR · Spacing & geometry');
const palette={navy:'#102F3A',brand:'#087F83',brandHover:'#06676B',brandPressed:'#045257',ink:'#172F38',muted:'#526872',subtle:'#70828B',white:'#FFFFFF',canvas:'#F5F8F9',line:'#DEE7E9',soft:'#EAF4F3',success:'#237747',successSoft:'#EAF5EC',warning:'#98620B',warningSoft:'#FFF4DB',danger:'#BC3F45',dangerSoft:'#FDEEF0',lime:'#D4EF85',disabled:'#E5ECEE',disabledText:'#82939A',map:'#EAF0EC'};
const prim=(await createSemanticTokens(primitives,{Value:primitives.defaultModeId},Object.entries(palette).map(([k,v])=>({name:k,type:'COLOR',values:{Value:v},scopes:[],codeSyntax:{WEB:'var(--mr-'+k+')'}})))).variables;
const sem=(await createSemanticTokens(colors,{Value:colors.defaultModeId},Object.entries(prim).map(([k,v])=>({name:'color/'+k,type:'COLOR',values:{Value:{type:'VARIABLE_ALIAS',id:v.id}},scopes:['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'],codeSyntax:{WEB:'var(--mr-color-'+k+')'}})))).variables;
const geoDefs=[...Array.from([0,4,8,12,16,20,24,32,40,48,64],n=>({name:'space/'+n,type:'FLOAT',values:{Value:n},scopes:['GAP'],codeSyntax:{WEB:'var(--mr-space-'+n+')'}})),...Array.from([8,12,16,24,999],n=>({name:'radius/'+n,type:'FLOAT',values:{Value:n},scopes:['CORNER_RADIUS'],codeSyntax:{WEB:'var(--mr-radius-'+n+')'}})),{name:'border/1',type:'FLOAT',values:{Value:1},scopes:['STROKE_FLOAT'],codeSyntax:{WEB:'var(--mr-border-width)'}}];
const geo=(await createSemanticTokens(geometry,{Value:geometry.defaultModeId},geoDefs)).variables;
await Promise.all(['Regular','Medium','SemiBold','Bold','ExtraBold'].map(style=>figma.loadFontAsync({family:'Manrope',style})));
await figma.loadFontAsync({family:'Noto Sans Devanagari',style:'Regular'});
const styleDefs={Display:[48,'ExtraBold',58],H1:[32,'Bold',42],H2:[24,'Bold',32],H3:[20,'Bold',28],Title:[16,'Bold',24],Body:[14,'Regular',22],Strong:[14,'SemiBold',22],Small:[12,'Medium',18],Caption:[11,'SemiBold',16],Metric:[28,'ExtraBold',36]};
const styles={};
for(const [name,[size,weight,line]] of Object.entries(styleDefs)){const s=figma.createTextStyle();s.name='MR/'+name;s.fontName={family:'Manrope',style:weight};s.fontSize=size;s.lineHeight={unit:'PIXELS',value:line};styles[name]=s.id;}
return {createdNodeIds,mutatedNodeIds,pages,collections:{primitives:primitives.id,colors:colors.id,geometry:geometry.id},variables:Object.fromEntries([...Object.entries(sem),...Object.entries(geo)].map(([k,v])=>[k,v.id])),styles,tokenCount:Object.keys(prim).length+Object.keys(sem).length+Object.keys(geo).length};
