const page=await figma.getNodeByIdAsync('3:5');await figma.setCurrentPageAsync(page);
const changed=[],extra=[];
const buttonSet=await figma.getNodeByIdAsync(COMPONENTS.Button);
function button(p,label,to){const c=buttonSet.children.find(n=>n.name==='Style=Secondary, State=Default');const n=instance(p,c,label);prop(n,'Label',label);n.resize(180,44);for(const t of n.findAllWithCriteria({types:['TEXT']}))t.textAutoResize='WIDTH_AND_HEIGHT';extra.push({id:n.id,to});return n;}
for(const key of['A10','A12','A13']){const screen=await figma.getNodeByIdAsync(SCREENS[key]);const body=screen.findOne(n=>n.type==='FRAME'&&n.name==='Main content');const tabs=box(body,'Customer type navigation',1128,'HORIZONTAL',12);body.insertChild(2,tabs);for(const[label,to]of[['Doctors','A10'],['Chemists','A12'],['Stockists & institutions','A13']]){const n=button(tabs,label,to);if(to===key)fill(n,'soft');}changed.push(body.id);}
const a21=await figma.getNodeByIdAsync(SCREENS.A21);const inspector=a21.findOne(n=>n.type==='FRAME'&&n.name==='Event inspector');button(inspector,'Location evidence','A47');
const nodeMap=new Map(page.findAll(()=>true).map(n=>[n.id,n]));const keyById=Object.fromEntries(Object.entries(SCREENS).map(([k,v])=>[v,k]));
function owner(n){let p=n;while(p&&p.type!=='PAGE'){if(keyById[p.id])return keyById[p.id];p=p.parent;}return null;}
const overrides={A12:{'Add chemist':'A50'},A13:{'Add customer':'A51'},A19:{'Create campaign':'A52'},A26:{'View receipt':'A46'}};
const linkMap=new Map();for(const l of LINKS){const n=nodeMap.get(l.id);if(!n)throw new Error('Missing source '+l.id);const key=owner(n);let to=overrides[key]?.[n.name]||l.to;if(n.name==='Settings')to='A53';if(n.name.startsWith('Return ')||n.name==='Request correction')to='A44';linkMap.set(n.id,to);}
for(const l of extra)linkMap.set(l.id,l.to);
function routeRows(screenKey,tableName,targets){const screen=nodeMap.get(SCREENS[screenKey]);const table=screen.findOne(n=>n.type==='FRAME'&&n.name===tableName);if(!table)throw new Error('Missing table '+tableName);const rows=table.children.filter(n=>/^Row \d+$/.test(n.name));rows.forEach((n,i)=>{const to=Array.isArray(targets)?targets[i]:targets;if(to)linkMap.set(n.id,to);});}
routeRows('A02','Needs your attention',['A24','A26','A28']);
routeRows('A08','Requests awaiting review',['A24','A26','A18','A27','A11']);
routeRows('A08','Review queues',['A24','A25','A27','A17']);
routeRows('A12','Chemist directory','A50');routeRows('A13','Institution directory','A51');
routeRows('A23','Visit timeline','A47');
routeRows('A32','Available reports',['A33','A22','A35','A34','A36','A25','A36']);
routeRows('A53','Administration',['A37','A07','A38','A09','A39']);
for(const[id,to]of [...linkMap])if(owner(nodeMap.get(id))===to)linkMap.delete(id);
for(const[id,to]of linkMap){const n=nodeMap.get(id);if(!SCREENS[to])throw new Error('Missing destination '+to);await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:SCREENS[to],navigation:'NAVIGATE',transition:{type:'DISSOLVE',easing:{type:'EASE_OUT'},duration:0.18}}]}]);changed.push(id);}
const policy=nodeMap.get(SCREENS.A37);for(const t of policy.findAllWithCriteria({types:['TEXT']}))if(t.characters.includes('Values below are proposed examples.')){t.characters='Changes apply to the selected company and division. Updated rules are recorded in the audit history.';changed.push(t.id);}
page.flowStartingPoints=[{nodeId:SCREENS.A01,name:'01 · Admin sign-in & overview'},{nodeId:SCREENS.A08,name:'02 · Review & approve field work'},{nodeId:SCREENS.A21,name:'03 · Field tracking & route replay'},{nodeId:SCREENS.A10,name:'04 · Customers & territory management'}];changed.push(page.id);
return {createdNodeIds:allids([nodeMap.get(SCREENS.A10).findOne(n=>n.name==='Customer type navigation'),nodeMap.get(SCREENS.A12).findOne(n=>n.name==='Customer type navigation'),nodeMap.get(SCREENS.A13).findOne(n=>n.name==='Customer type navigation')]),mutatedNodeIds:[...new Set(changed)],prototypeLinks:[...linkMap].map(([id,to])=>[id,to]),linkCount:linkMap.size,flowStarts:page.flowStartingPoints,screenCount:Object.keys(SCREENS).length};
