/**
 * MCP App (ui:// resource) that renders Rundeck cards inside the chat: a job
 * card (options + Run), an execution card (status + log tail, auto-refresh) and
 * a runners list. One HTML for all three; the tool result's
 * `structuredContent.kind` picks the view. No external requests: data comes
 * from the host (ui/notifications/tool-result) and actions go back through it
 * (tools/call, ui/open-link). Protocol: MCP Apps, protocolVersion 2026-01-26.
 */
export const CARD_HTML = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:transparent;--card:#fff;--fg:#1f2328;--muted:#656d76;--line:#d0d7de;--accent:#0969da;--ok:#1a7f37;--bad:#cf222e;--run:#9a6700;--chip:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--card:#161b22;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--accent:#4493f8;--ok:#3fb950;--bad:#f85149;--run:#d29922;--chip:#21262d}}
*{box-sizing:border-box}html,body{background:var(--card)}body{margin:0;color:var(--fg);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 10px}.card:last-child{margin-bottom:0}
.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
h1{font-size:15px;margin:0 0 2px;font-weight:600}.sub{color:var(--muted);font-size:12px}
.desc{margin:8px 0 0;color:var(--muted)}a{color:var(--accent);cursor:pointer;text-decoration:none}
.badge{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:12px;white-space:nowrap}
.dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}.ok .dot{background:var(--ok)}.bad .dot{background:var(--bad)}.run .dot{background:var(--run)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.chip{background:var(--chip);border:1px solid var(--line);border-radius:6px;padding:1px 8px;font-size:12px;font-family:ui-monospace,Menlo,monospace}
table{width:100%;border-collapse:collapse;margin-top:10px}td{padding:4px 0;vertical-align:middle}td.k{color:var(--muted);width:34%;font-size:13px}
input,select{width:100%;font:inherit;color:var(--fg);background:var(--chip);border:1px solid var(--line);border-radius:6px;padding:4px 8px}
.actions{display:flex;gap:8px;margin-top:12px;align-items:center}
button{font:inherit;border-radius:6px;border:1px solid var(--line);background:var(--chip);color:var(--fg);padding:5px 14px;cursor:pointer;white-space:nowrap;flex:none}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}button:disabled{opacity:.5;cursor:default}
pre{background:var(--chip);border:1px solid var(--line);border-radius:6px;padding:8px;margin:10px 0 0;max-height:220px;overflow:auto;font:12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap}
.err{color:var(--bad);font-size:13px;margin-top:8px}.empty{color:var(--muted)}
</style></head><body><div id="root"><div class="card empty">Loading…</div></div>
<script>
(function(){
  var nextId=1, pending={}, root=document.getElementById('root'), timer=null;
  function send(m){window.parent.postMessage(m,'*')}
  function request(method,params){var id=nextId++;send({jsonrpc:'2.0',id:id,method:method,params:params});return new Promise(function(res,rej){pending[id]={res:res,rej:rej}})}
  function notify(method,params){send({jsonrpc:'2.0',method:method,params:params})}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function cls(st){st=String(st||'').toLowerCase();if(/succeed|healthy|ok|connected|active/.test(st))return 'ok';if(/fail|abort|unhealthy|timedout|error|disconnect|never/.test(st))return 'bad';if(/run|schedul|queued|pending/.test(st))return 'run';return ''}
  function badge(st){return '<span class="badge '+cls(st)+'"><span class="dot"></span>'+esc(st||'unknown')+'</span>'}
  function link(url,text){return url?'<a data-url="'+esc(url)+'">'+esc(text||'Open in Rundeck')+' ↗</a>':''}
  function resize(){notify('ui/notifications/size-changed',{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})}
  function summary(t){return String(t||'').split(/\n\s*---\s*\n|\n\s*\n/)[0].trim()}
  function askInChat(text){return request('ui/message',{role:'user',content:[{type:'text',text:text}]})}
  function callTool(name,args){return request('tools/call',{name:name,arguments:args}).then(function(r){if(r&&r.isError){throw new Error((r.content&&r.content[0]&&r.content[0].text)||'Tool error')}return r})}

  function renderJob(d){
    var rows=(d.options||[]).map(function(o){
      var input=o.values&&o.values.length&&o.enforced
        ?'<select data-opt="'+esc(o.name)+'">'+o.values.map(function(v){return '<option'+(v===o.value?' selected':'')+'>'+esc(v)+'</option>'}).join('')+'</select>'
        :'<input data-opt="'+esc(o.name)+'" value="'+esc(o.value||'')+'" placeholder="'+(o.required?'required':'optional')+'">';
      return '<tr><td class="k">'+esc(o.name)+(o.required?' *':'')+'</td><td>'+input+'</td></tr>'}).join('');
    var last=d.lastExecution?'<div class="sub" style="margin-top:8px">Last run: '+badge(d.lastExecution.status)+' '+esc(d.lastExecution.date||'')+' '+link(d.lastExecution.permalink,'#'+d.lastExecution.id)+'</div>':'';
    root.innerHTML='<div class="card"><div class="top"><div><div class="sub">'+esc(d.project)+(d.group?' · '+esc(d.group):'')+'</div><h1>'+esc(d.name)+'</h1></div><span class="badge">Rundeck job</span></div>'+
      (d.description?'<p class="desc">'+esc(summary(d.description))+'</p>':'')+(rows?'<table>'+rows+'</table>':'')+last+
      '<div class="actions"><button class="primary" id="run">Run job</button>'+link(d.permalink)+'</div><div class="err" id="err"></div></div>';
    document.getElementById('run').onclick=function(){
      var b=this,opts={};b.disabled=true;b.textContent='Starting…';
      Array.prototype.forEach.call(root.querySelectorAll('[data-opt]'),function(el){if(el.value!=='')opts[el.getAttribute('data-opt')]=el.value});
      var label=Object.keys(opts).map(function(k){return k+'='+opts[k]}).join(', ');
      var prompt='Yes, run the Rundeck job '+d.project+' → '+(d.group?d.group+'/':'')+d.name+' (job_id '+d.id+')'+(label?' with '+label:'')+'.';
      callTool('run_job',{job_id:d.id,options:opts}).then(function(r){render(r.structuredContent)}).catch(function(){
        askInChat(prompt).then(function(){b.textContent='Sent to chat'}).catch(function(){b.disabled=false;b.textContent='Run job';document.getElementById('err').textContent='This app cannot run tools from the card. Reply in chat: '+prompt})})};
  }

  function renderExecution(d){
    var running=/running|scheduled|queued/i.test(d.status||'');
    root.innerHTML='<div class="card"><div class="top"><div><div class="sub">'+esc(d.project)+' · execution #'+esc(d.id)+'</div><h1>'+esc(d.title||'Execution')+'</h1></div>'+badge(d.status)+'</div>'+
      '<table>'+(d.node?'<tr><td class="k">Node</td><td><span class="chip">'+esc(d.node)+'</span></td></tr>':'')+
      (d.user?'<tr><td class="k">Started by</td><td>'+esc(d.user)+'</td></tr>':'')+
      (d.duration?'<tr><td class="k">Duration</td><td>'+esc(d.duration)+'</td></tr>':'')+'</table>'+
      (d.log?'<pre>'+esc(d.log)+'</pre>':'')+
      '<div class="actions"><button id="refresh">'+(running?'Refreshing…':'Refresh')+'</button>'+link(d.permalink)+'</div></div>';
    document.getElementById('refresh').onclick=function(){poll(d.id)};
    clearTimeout(timer);if(running){timer=setTimeout(function(){poll(d.id)},3000)}
  }
  function poll(id){callTool('execution_status',{execution_id:String(id)}).then(function(r){render(r.structuredContent)}).catch(function(){})}

  function renderRunners(d){
    var list=d.runners||[];
    var cards=list.map(function(r){
      var rows=(r.projects&&r.projects.length?'<tr><td class="k">Projects</td><td>'+r.projects.map(function(p){return '<span class="chip">'+esc(p)+'</span>'}).join(' ')+'</td></tr>':'')+
        (r.node?'<tr><td class="k">Node filter</td><td><span class="chip">name: '+esc(r.node)+'</span></td></tr>':'')+
        (r.details||[]).map(function(x){return '<tr><td class="k">'+esc(x[0])+'</td><td>'+esc(x[1])+'</td></tr>'}).join('');
      return '<div class="card"><div class="top"><div><div class="sub">Rundeck runner</div><h1>'+esc(r.name)+'</h1></div>'+badge(r.status)+'</div>'+
        (r.description?'<p class="desc">'+esc(summary(r.description))+'</p>':'')+
        (r.tags&&r.tags.length?'<div class="chips">'+r.tags.map(function(t){return '<span class="chip">'+esc(t)+'</span>'}).join('')+'</div>':'')+
        (rows?'<table>'+rows+'</table>':'')+'</div>'}).join('');
    root.innerHTML=cards||'<div class="card"><h1>No runners found</h1><p class="desc">No runners are visible in this project. Runners need Rundeck Enterprise.</p></div>';
  }

  function render(d){
    if(!d){return}
    if(d.kind==='job')renderJob(d);else if(d.kind==='execution')renderExecution(d);else if(d.kind==='runners')renderRunners(d);
    else root.innerHTML='<div class="card empty">Nothing to show.</div>';
    Array.prototype.forEach.call(root.querySelectorAll('[data-url]'),function(a){a.onclick=function(){request('ui/open-link',{url:a.getAttribute('data-url')}).catch(function(){})}});
    setTimeout(resize,0);
  }

  window.addEventListener('message',function(ev){
    var m=ev.data;if(!m||m.jsonrpc!=='2.0')return;
    if(m.id!=null&&pending[m.id]&&!m.method){var p=pending[m.id];delete pending[m.id];m.error?p.rej(new Error(m.error.message)):p.res(m.result);return}
    if(m.method==='ui/notifications/tool-result'){render(m.params&&m.params.structuredContent)}
    else if(m.id!=null&&m.method){send({jsonrpc:'2.0',id:m.id,result:{}})}
  });
  request('ui/initialize',{appInfo:{name:'rundeck-cards',version:'0.1.0'},appCapabilities:{},protocolVersion:'2026-01-26'})
    .then(function(){notify('ui/notifications/initialized',{})}).catch(function(){});
  new ResizeObserver(resize).observe(document.body);
})();
</script></body></html>`;
