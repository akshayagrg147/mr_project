const page=await figma.getNodeByIdAsync('0:1');await figma.setCurrentPageAsync(page);
const changed=[];
const contact=await figma.getNodeByIdAsync('4:279');
const initials=contact.findOne(n=>n.type==='TEXT'&&n.characters==='AJ');
let initialKey=Object.keys(contact.componentPropertyDefinitions).find(k=>k.startsWith('Initials#'));
if(!initialKey)initialKey=contact.addComponentProperty('Initials','TEXT','AJ');
initials.name='Initials';initials.componentPropertyReferences={characters:initialKey};changed.push(contact.id,initials.id);
const navigation=await figma.getNodeByIdAsync('4:268');for(const c of navigation.children){c.primaryAxisAlignItems='MIN';changed.push(c.id);}
const set=await figma.getNodeByIdAsync('4:14');const refresh=await figma.getNodeByIdAsync('4:101');
for(const c of set.children.filter(n=>n.name.includes('State=Loading'))){const n=instance(c,refresh,'Loading indicator');n.resize(16,16);c.insertChild(0,n);for(const v of n.findAll(()=>true))if('strokes'in v&&Array.isArray(v.strokes)&&v.strokes.length)v.strokes=[paint(c.name.includes('Secondary')?'brand':'white')];changed.push(c.id);}
const bottomItems=[['Today','house'],['Calls','stethoscope'],['Plan','calendar-days'],['Reports','chart-no-axes-combined'],['More','menu']];const icons={};for(const[k,id]of Object.entries(COMPONENTS.Icons))icons[k]=await figma.getNodeByIdAsync(id);
const variants=[];for(const [selected]of bottomItems){const c=reg(figma.createComponent());page.appendChild(c);c.name='Active='+selected;c.layoutMode='HORIZONTAL';c.resize(390,76);c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';pad(c,8);gap(c,0);fill(c,'white');for(const[label,icon]of bottomItems){const n=box(c,label,74.8,'VERTICAL',4,4,selected===label?'soft':null,12);n.counterAxisAlignItems='CENTER';const ic=instance(n,icons[icon]);ic.resize(20,20);tx(n,label,'Caption',selected===label?'brand':'muted');}variants.push(c);}
const bottom=reg(figma.combineAsVariants(variants,page));bottom.name='MR/Bottom navigation';bottom.description='Five-destination mobile navigation. Active destination is a variant; icons and labels are consistent across screens.';bottom.x=40;bottom.y=4050;for(let i=0;i<bottom.children.length;i++){bottom.children[i].x=40+(i%3)*430;bottom.children[i].y=40+Math.floor(i/3)*116;}bottom.resize(1370,280);
return {createdNodeIds:allids([bottom,...set.children.filter(n=>n.name.includes('State=Loading'))]),mutatedNodeIds:changed,bottomNavigation:bottom.id,initialsProperty:initialKey};
