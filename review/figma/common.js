const vars=Object.fromEntries((await figma.variables.getLocalVariablesAsync()).map(v=>[v.name,v]));
const styles=Object.fromEntries((await figma.getLocalTextStylesAsync()).filter(s=>s.name.startsWith('MR/')).map(s=>[s.name.slice(3),s.id]));
await Promise.all(['Regular','Medium','SemiBold','Bold','ExtraBold'].map(style=>figma.loadFontAsync({family:'Manrope',style})));
await figma.loadFontAsync({family:'Noto Sans Devanagari',style:'Regular'});
const made=[];
function reg(n){made.push(n.id);return n;}
function paint(k){return figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',vars['color/'+k]);}
function fill(n,k){n.fills=k?[paint(k)]:[];return n;}
function stroke(n,k='line'){n.strokes=[paint(k)];n.strokeWeight=1;return n;}
function gap(n,x){if(vars['space/'+x])n.setBoundVariable('itemSpacing',vars['space/'+x]);else n.itemSpacing=x;}
function pad(n,x){for(const k of ['paddingTop','paddingRight','paddingBottom','paddingLeft']){if(vars['space/'+x])n.setBoundVariable(k,vars['space/'+x]);else n[k]=x;}}
function radius(n,x){for(const k of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius']){if(vars['radius/'+x])n.setBoundVariable(k,vars['radius/'+x]);else n[k]=x;}}
function box(p,name,w,dir='VERTICAL',g=12,pa=0,bg=null,r=0){const n=reg(figma.createAutoLayout(dir));n.name=name;p.appendChild(n);n.resize(w,10);n.primaryAxisSizingMode=dir==='VERTICAL'?'AUTO':'FIXED';n.counterAxisSizingMode=dir==='VERTICAL'?'FIXED':'AUTO';gap(n,g);pad(n,pa);fill(n,bg);if(r)radius(n,r);n.clipsContent=false;return n;}
function tx(p,str,sty='Body',col='ink',w){const t=reg(figma.createText());p.appendChild(t);t.name=str.slice(0,64);t.textStyleId=styles[sty]||styles.Body;if(/[\u0900-\u097F]/.test(str))t.fontName={family:'Noto Sans Devanagari',style:'Regular'};t.characters=String(str);fill(t,col);if(w){t.resize(w,t.height);t.textAutoResize='HEIGHT';}else t.textAutoResize='WIDTH_AND_HEIGHT';return t;}
function divider(p,w){const d=reg(figma.createRectangle());p.appendChild(d);d.name='Divider';d.resize(w,1);fill(d,'line');return d;}
function spacer(p,h){const n=reg(figma.createFrame());p.appendChild(n);n.name='Spacer';n.resize(1,h);n.fills=[];return n;}
function instance(p,c,name){const n=reg(c.createInstance());p.appendChild(n);if(name)n.name=name;return n;}
function prop(n,prefix,value){const key=Object.keys(n.componentProperties).find(k=>k.startsWith(prefix));if(key)n.setProperties({[key]:String(value)});return n;}
function allids(roots){return [...new Set([...made,...roots.flatMap(n=>[n.id,...('findAll' in n?n.findAll(()=>true).map(x=>x.id):[])])])];}
function cap(p,str,w){return tx(p,str.toUpperCase(),'Caption','muted',w);}
