import assert from 'node:assert/strict';
import {test} from 'node:test';
import {activitySeries,renderActivityChart} from '../../website/admin/activity-chart.js';

test('server UTC day anchors 30 days and pre-collection dates stay unknown',()=>{
 const series=activitySeries([{day:'2026-10-04',active:2}],new Date('2026-10-04T23:00:00Z'),'2026-10-03');
 assert.equal(series.length,30);assert.equal(series[0].day,'2026-09-05');assert.equal(series[27].active,null);assert.equal(series[28].active,0);assert.equal(series[29].active,2);
});
test('axes, exact scaling, history label and empty foreground state',()=>{
 class Node{constructor(){this.namespaceURI='http://www.w3.org/2000/svg';this.attrs={};this.children=[];}setAttribute(k,v){this.attrs[k]=v;}append(n){this.children.push(n);}replaceChildren(n){this.children=[n];}}
 globalThis.document={createElementNS:()=>new Node()};
 const container=new Node();renderActivityChart(container,[{day:'2026-10-01',active:34}],'2026-10-04',undefined,'更新检查安装数');
 let nodes=container.children[0].children;const bars=nodes.filter(n=>n.attrs.class==='chart-bar');assert.equal(bars.length,30);assert.equal(bars[0].attrs.height,0);assert.equal(bars[26].attrs.height,34/36*192);assert(nodes.some(n=>n.textContent==='更新检查安装数'));assert(nodes.some(n=>n.textContent==='日期（UTC）'));
 renderActivityChart(container,[],'2026-10-04','2026-10-04');nodes=container.children[0].children;assert(nodes.some(n=>n.textContent==='尚未收到新版客户端的前台活跃上报'));assert.equal(nodes.filter(n=>n.attrs.fill==='#f1f5f9').length,29);
 delete globalThis.document;
});
