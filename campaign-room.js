import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const SUPABASE_URL = "https://ogjzsmymvomfyqkkdsgt.supabase.co";
const SUPABASE_KEY = "sb_publishable_ergFTN1V7Alb2nawH4bk_w_N8xy_0yp";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (id) => document.getElementById(id);
const state = { user:null, role:null, articles:[], current:null, blocks:[] };
const escapeHtml = (value="") => String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const slugify = (value="") => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
const PRESS_COLORS = {red:"#e83d4b",navy:"#172b4d",blue:"#82bee1",black:"#1d2d49"};
function sanitizeRichHtml(input=""){
  const parsed=new DOMParser().parseFromString(String(input),"text/html");
  const allowed=new Set(["B","STRONG","I","EM","U","BR","P","DIV","SPAN","FONT"]);
  function clean(node){
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent||"");
    if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
    if(!allowed.has(node.tagName)){
      const fragment=document.createDocumentFragment();
      [...node.childNodes].forEach(child=>fragment.append(clean(child)));
      return fragment;
    }
    const tag=node.tagName==="FONT"?"SPAN":node.tagName.toLowerCase();
    const out=document.createElement(tag);
    if(tag==="span"){
      const raw=node.getAttribute("color")||node.style.color||"";
      const normalized=raw.toLowerCase().replace(/\\s+/g,"");
      const rgbMap={"rgb(232,61,75)":"#e83d4b","rgb(23,43,77)":"#172b4d","rgb(130,190,225)":"#82bee1","rgb(29,45,73)":"#1d2d49"};
      const color=Object.values(PRESS_COLORS).find(v=>v.toLowerCase()===normalized)||rgbMap[normalized];
      if(color)out.style.color=color;
    }
    [...node.childNodes].forEach(child=>out.append(clean(child)));
    return out;
  }
  const root=document.createElement("div");
  [...parsed.body.childNodes].forEach(node=>root.append(clean(node)));
  return root.innerHTML;
}
function notice(target, message, kind="") { const el=$(target); el.textContent=message; el.className="notice"+(kind?" "+kind:""); el.classList.remove("hidden"); }
function clearNotice(target) { $(target).classList.add("hidden"); }
function dateLabel(value) { return value ? new Date(value).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}) : "Not submitted"; }
function setBusy(button,busy,label) { button.disabled=busy; if(busy) button.dataset.old=button.textContent; button.textContent=busy?"Please wait…":(label||button.dataset.old||"Save"); }

$("authForm").addEventListener("submit",async e=>{
  e.preventDefault(); const button=$("authSubmit"); setBusy(button,true);
  const identifier=$("authEmail").value.trim(), password=$("authPassword").value;
  const email=identifier.includes("@")?identifier:identifier.toLowerCase()+"@staff.electament.invalid";
  try {
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error) throw error;
    await enterApp(data.user);
  } catch(err) { notice("authMessage",err.message||"Authentication failed.","error"); }
  finally { setBusy(button,false,"Sign in"); }
});
$("signout").addEventListener("click",async()=>{await supabase.auth.signOut();state.user=null;state.role=null;$("appView").classList.add("hidden");$("authView").classList.remove("hidden");$("signout").classList.add("hidden");});

async function enterApp(user){
  state.user=user;
  const {data:member,error}=await supabase.from("campaign_members").select("role,active").eq("user_id",user.id).maybeSingle();
  if(error) throw error;
  if(!member || !member.active){
    await supabase.auth.signOut();
    notice("authMessage","Your account is verified, but it does not have active Campaign Room access yet. Ask the campaign administrator to grant staff access.","error");
    return;
  }
  state.role=member.role;
  $("authView").classList.add("hidden");$("appView").classList.remove("hidden");$("signout").classList.remove("hidden");
  $("welcomeText").textContent=(state.role==="admin"?"Administrator access":"Staff access")+" · Signed in as "+user.email+". Drafts and review activity are saved securely.";
  $("memberPanel").classList.toggle("hidden",state.role!=="admin");
  await loadArticles();
  if(state.role==="admin") await loadMembers();
}
const {data:initial}=await supabase.auth.getSession();
if(initial.session) { try { await enterApp(initial.session.user); } catch(err) { notice("authMessage",err.message,"error"); } }

async function loadArticles(selectId=null){
  const {data,error}=await supabase.from("articles").select("*").order("updated_at",{ascending:false});
  if(error) throw error;
  state.articles=data||[];
  renderArticleList();
  if(selectId){ const found=state.articles.find(a=>a.id===selectId); if(found) openEditor(found); }
  else if(state.current){ const found=state.articles.find(a=>a.id===state.current.id); if(found) openEditor(found); }
}
function renderArticleList(){
  const list=$("articleList");
  if(!state.articles.length){list.innerHTML='<div class="empty">No articles yet.<br>Start with a new press release.</div>';return;}
  list.innerHTML=state.articles.map(a=>'<button class="article-item '+(state.current?.id===a.id?'active':'')+'" data-id="'+a.id+'"><strong>'+escapeHtml(a.title)+'</strong><span class="status '+a.status+'">'+escapeHtml(a.status.replace("_"," "))+'</span><small style="float:right">'+dateLabel(a.updated_at)+'</small></button>').join("");
  list.querySelectorAll("[data-id]").forEach(btn=>btn.addEventListener("click",()=>{const a=state.articles.find(x=>x.id===btn.dataset.id);openEditor(a);}));
}
$("newArticle").addEventListener("click",()=>openEditor({id:null,title:"",slug:"",excerpt:"",content:[],hero_image:"",status:"draft",author_id:state.user.id,review_note:""}));

function openEditor(article){
  state.current={...article}; state.blocks=Array.isArray(article.content)?structuredClone(article.content):[];
  renderArticleList();
  const admin=state.role==="admin";
  const isNew=!article.id;
  const canEdit=admin ? ["draft","submitted","changes_requested"].includes(article.status) : ["draft","submitted","changes_requested"].includes(article.status);
  const canPropose=article.status==="published";
  const canReview=admin && article.status==="submitted";
  $("editorPanel").innerHTML=`
    <div class="editor-head"><div><span class="eyebrow">${isNew?"New press release":"Article workspace"}</span><h2>${escapeHtml(article.title||"Untitled press release")}</h2><span class="status ${article.status}">${escapeHtml(article.status.replace("_"," "))}</span></div>
    <div class="editor-actions">${!isNew?'<button class="btn ghost" id="refreshArticle">Refresh</button>':""}${canPropose?'<button class="btn blue" id="proposeEdit">Create revision</button>':""}<button class="btn" id="saveDraft" ${canEdit?"":"disabled"}>Save draft</button><button class="btn blue" id="submitArticle" ${canEdit?"":"disabled"}>Submit for approval</button></div></div>
    <div class="grid2">
      <div class="field"><label for="articleTitle">Headline</label><input id="articleTitle" maxlength="180" value="${escapeHtml(article.title)}" ${canEdit?"":"disabled"}></div>
      <div class="field"><label for="articleSlug">URL slug</label><input id="articleSlug" maxlength="80" value="${escapeHtml(article.slug)}" ${canEdit?"":"disabled"}><span class="help">Lowercase letters, numbers, and hyphens.</span></div>
      <div class="field" style="grid-column:1/-1"><label for="articleExcerpt">News-card excerpt</label><textarea id="articleExcerpt" rows="3" ${canEdit?"":"disabled"}>${escapeHtml(article.excerpt)}</textarea></div>
      <div class="field" style="grid-column:1/-1"><label for="heroImage">Hero image URL (optional)</label><input id="heroImage" value="${escapeHtml(article.hero_image||"")}" placeholder="Upload an image below or paste a public image URL" ${canEdit?"":"disabled"}></div>
    </div>
    <div class="block-head"><strong>Article content</strong><div class="block-tools"><button class="btn ghost" id="addText" ${canEdit?"":"disabled"}>+ Text section</button><button class="btn ghost" id="addImage" ${canEdit?"":"disabled"}>+ Image</button></div></div>
    <p class="help">Arrange text and image blocks in any order. Image blocks support captions and full-width, left, or right layouts.</p>
    <div id="blocks"></div>
    ${article.review_note?'<div class="notice">Reviewer note: '+escapeHtml(article.review_note)+'</div>':""}
    ${canReview?'<div class="review-box"><h3>Administrator review</h3><div class="field"><label for="reviewNote">Review note (optional for approval)</label><textarea id="reviewNote" rows="2" placeholder="Feedback for the author or editorial record"></textarea></div><div class="editor-actions"><button class="btn" id="approveArticle">Approve & publish</button><button class="btn blue" id="requestChanges">Request changes</button><button class="btn red" id="rejectArticle">Reject</button></div></div>':""}
    ${admin && article.status==="published"?'<div class="notice">This article is currently published. Changes saved by an administrator update this CMS record immediately; use the review controls on a submitted draft for staff-proposed revisions.</div>':""}
  `;
  renderBlocks(canEdit);
  if(canEdit){
    $("addText").addEventListener("click",()=>{state.blocks.push({type:"text",text:""});renderBlocks(true);});
    $("addImage").addEventListener("click",()=>{state.blocks.push({type:"image",url:"",caption:"",layout:"wide"});renderBlocks(true);});
    $("saveDraft").addEventListener("click",()=>saveArticle("draft"));
    $("submitArticle").addEventListener("click",()=>saveArticle("submitted"));
    $("articleTitle").addEventListener("input",()=>{if(!$("articleSlug").dataset.edited)$("articleSlug").value=slugify($("articleTitle").value);});
    $("articleSlug").addEventListener("input",()=>{$("articleSlug").dataset.edited="1";});
  }
  if(!isNew) $("refreshArticle")?.addEventListener("click",()=>loadArticles(article.id));
  if(canPropose) $("proposeEdit").addEventListener("click",()=>{
    const proposal={...article,id:null,status:"draft",author_id:state.user.id,supersedes_id:article.id,slug:article.slug+"-revision-"+Date.now(),review_note:""};
    openEditor(proposal);
    notice("appMessage","You are editing a proposed revision. The published article will not change unless an administrator approves it.","good");
  });
  if(canReview){
    $("approveArticle").addEventListener("click",()=>reviewArticle("published"));
    $("requestChanges").addEventListener("click",()=>reviewArticle("changes_requested"));
    $("rejectArticle").addEventListener("click",()=>reviewArticle("rejected"));
  }
}
function renderBlocks(canEdit){
  const host=$("blocks");
  if(!state.blocks.length){host.innerHTML='<div class="empty">No content blocks yet. Add a text section or image.</div>';return;}
  host.innerHTML=state.blocks.map((b,i)=>`
    <div class="block" data-block="${i}"><div class="block-top"><b>${b.type==="image"?"Image block":"Text section"} · ${i+1}</b><div class="block-controls">${canEdit?'<button class="icon-btn" data-up="'+i+'" aria-label="Move up">↑</button><button class="icon-btn" data-down="'+i+'" aria-label="Move down">↓</button><button class="icon-btn" data-remove="'+i+'" aria-label="Remove">Remove</button>':""}</div></div>
    ${b.type==="image"?`
      <div class="field"><label>Image URL</label><input data-key="url" value="${escapeHtml(b.url||"")}" ${canEdit?"":"disabled"} placeholder="Upload an image or paste URL"></div>
      ${b.url?'<img src="'+escapeHtml(b.url)+'" alt="Image preview" loading="lazy">':""}
      <div class="grid2"><div class="field"><label>Caption / credit</label><input data-key="caption" value="${escapeHtml(b.caption||"")}" ${canEdit?"":"disabled"}></div><div class="field"><label>Layout</label><select data-key="layout" ${canEdit?"":"disabled"}><option value="wide" ${b.layout==="wide"?"selected":""}>Full width</option><option value="left" ${b.layout==="left"?"selected":""}>Align left</option><option value="right" ${b.layout==="right"?"selected":""}>Align right</option></select></div></div>
      ${canEdit?'<div class="field"><label>Upload image (JPG, PNG, WebP, GIF · max 10 MB)</label><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-upload="'+i+'"></div>':""}
    `:`
      ${canEdit?`<div class="rich-tools" role="toolbar" aria-label="Text formatting">
        <button type="button" class="icon-btn" data-format="bold" title="Bold"><strong>B</strong></button>
        <button type="button" class="icon-btn" data-format="italic" title="Italic"><em>I</em></button>
        <button type="button" class="icon-btn" data-format="underline" title="Underline"><u>U</u></button>
        <span class="rich-color-label">Text color</span>
        <button type="button" class="color-swatch" data-color="#e83d4b" aria-label="Red text" title="Red"></button>
        <button type="button" class="color-swatch navy" data-color="#172b4d" aria-label="Navy text" title="Navy"></button>
        <button type="button" class="color-swatch blue" data-color="#82bee1" aria-label="Blue text" title="Blue"></button>
        <button type="button" class="color-swatch black" data-color="#1d2d49" aria-label="Dark text" title="Dark"></button>
      </div>`: ""}
      <div class="field"><label>Text</label><div class="rich-editor" data-richtext="1" contenteditable="${canEdit?"true":"false"}" role="textbox" aria-multiline="true" data-placeholder="Write this section of the press release…">${sanitizeRichHtml(b.html||escapeHtml(b.text||""))}</div></div>
      <span class="help">Select a word or phrase, then choose bold, italic, underline, or a text color.</span>
    `}
    </div>`).join("");
  host.querySelectorAll("[data-key]").forEach(el=>el.addEventListener("input",()=>{const i=Number(el.closest("[data-block]").dataset.block);state.blocks[i][el.dataset.key]=el.value;}));
  host.querySelectorAll("[data-richtext]").forEach(el=>el.addEventListener("input",()=>{
    const i=Number(el.closest("[data-block]").dataset.block);
    state.blocks[i].html=sanitizeRichHtml(el.innerHTML);
    state.blocks[i].text=el.innerText;
  }));
  host.querySelectorAll("[data-format]").forEach(btn=>btn.addEventListener("mousedown",e=>e.preventDefault()));
  host.querySelectorAll("[data-format]").forEach(btn=>btn.addEventListener("click",()=>{
    const editor=btn.closest(".block").querySelector("[data-richtext]");
    editor.focus();document.execCommand(btn.dataset.format,false,null);
    const i=Number(btn.closest("[data-block]").dataset.block);
    state.blocks[i].html=sanitizeRichHtml(editor.innerHTML);state.blocks[i].text=editor.innerText;
  }));
  host.querySelectorAll("[data-color]").forEach(btn=>btn.addEventListener("mousedown",e=>e.preventDefault()));
  host.querySelectorAll("[data-color]").forEach(btn=>btn.addEventListener("click",()=>{
    const editor=btn.closest(".block").querySelector("[data-richtext]");
    editor.focus();document.execCommand("foreColor",false,btn.dataset.color);
    const i=Number(btn.closest("[data-block]").dataset.block);
    state.blocks[i].html=sanitizeRichHtml(editor.innerHTML);state.blocks[i].text=editor.innerText;
  }));
  host.querySelectorAll("[data-remove]").forEach(el=>el.addEventListener("click",()=>{state.blocks.splice(Number(el.dataset.remove),1);renderBlocks(canEdit);}));
  host.querySelectorAll("[data-up]").forEach(el=>el.addEventListener("click",()=>moveBlock(Number(el.dataset.up),-1,canEdit)));
  host.querySelectorAll("[data-down]").forEach(el=>el.addEventListener("click",()=>moveBlock(Number(el.dataset.down),1,canEdit)));
  host.querySelectorAll("[data-upload]").forEach(el=>el.addEventListener("change",e=>uploadImage(Number(el.dataset.upload),e.target.files[0],e.target)));
}
function moveBlock(i,dir,canEdit){const j=i+dir;if(j<0||j>=state.blocks.length)return;[state.blocks[i],state.blocks[j]]=[state.blocks[j],state.blocks[i]];renderBlocks(canEdit);}
async function uploadImage(index,file,input){
  if(!file)return;
  if(file.size>10*1024*1024){notice("appMessage","Images must be 10 MB or smaller.","error");input.value="";return;}
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
  const path=state.user.id+"/"+crypto.randomUUID()+"."+ext;
  const {error}=await supabase.storage.from("campaign-media").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(error){notice("appMessage",error.message,"error");return;}
  const {data}=supabase.storage.from("campaign-media").getPublicUrl(path);
  state.blocks[index].url=data.publicUrl;
  renderBlocks(true);
  notice("appMessage","Image uploaded. Save the article to keep this image in the draft.","good");
}
async function saveArticle(status){
  const title=$("articleTitle").value.trim(), slug=slugify($("articleSlug").value.trim()||title);
  if(!title){notice("appMessage","Add a headline before saving.","error");return;}
  const payload={title,slug,excerpt:$("articleExcerpt").value.trim(),hero_image:$("heroImage").value.trim()||null,content:state.blocks,status};
  if(status==="submitted") payload.submitted_at=new Date().toISOString();
  const button=$(status==="draft"?"saveDraft":"submitArticle");setBusy(button,true);
  try{
    let result;
    if(state.current.id) {
      result=await supabase.from("articles").update(payload).eq("id",state.current.id).select().single();
    } else {
      const initialPayload={...payload,author_id:state.user.id,status:"draft",...(state.current.supersedes_id?{supersedes_id:state.current.supersedes_id}:{})};
      result=await supabase.from("articles").insert(initialPayload).select().single();
      if(!result.error && status==="submitted") {
        result=await supabase.from("articles").update({status:"submitted",submitted_at:payload.submitted_at}).eq("id",result.data.id).select().single();
      }
    }
    if(result.error)throw result.error;
    notice("appMessage",status==="submitted"?"Article submitted to the administrator for review.":"Draft saved.","good");
    await loadArticles(result.data.id);
  }catch(err){notice("appMessage",err.message,"error");}
  finally{setBusy(button,false,status==="draft"?"Save draft":"Submit for approval");}
}
async function reviewArticle(status){
  const note=$("reviewNote").value.trim();
  const update={status,reviewed_at:new Date().toISOString(),reviewed_by:state.user.id,review_note:note};
  if(status==="published") update.published_at=new Date().toISOString();
  try{
    let approvedId=state.current.id;
    if(status==="published") {
      const {data,error}=await supabase.rpc("admin_publish_article",{p_article_id:state.current.id,p_review_note:note});
      if(error)throw error;
      approvedId=data;
    } else {
      const {error}=await supabase.from("articles").update(update).eq("id",state.current.id);
      if(error)throw error;
    }
    notice("appMessage",status==="published"?"Approved and published. Any published article revision now replaces the live CMS version.":status==="changes_requested"?"Changes requested; the author can revise and resubmit.":"Submission rejected.","good");
    await loadArticles(approvedId);
  }catch(err){notice("appMessage",err.message,"error");}
}
async function loadMembers(){
  const {data,error}=await supabase.rpc("admin_list_campaign_members");
  if(error){notice("appMessage",error.message,"error");return;}
  $("memberList").innerHTML=(data||[]).map(m=>`
    <div class="member-row"><div><strong>${escapeHtml(m.username||m.email||m.user_id)}</strong><small>${escapeHtml(m.role)} · ${m.active?"Active":"Suspended"}</small></div><div class="editor-actions"><button class="btn ${m.active?"ghost":"blue"}" data-member="${m.user_id}" data-active="${m.active}">${m.active?"Suspend access":"Restore access"}</button><button class="btn ghost" data-reset="${m.user_id}">Reset password</button></div></div>`).join("")||'<p class="help">No active members have been added yet.</p>';
  $("memberList").querySelectorAll("[data-member]").forEach(btn=>btn.addEventListener("click",async()=>{
    const {error}=await supabase.rpc("admin_set_campaign_member_active",{p_user_id:btn.dataset.member,p_active:btn.dataset.active!=="true"});
    if(error)notice("appMessage",error.message,"error");else{notice("appMessage","Staff access updated.","good");loadMembers();}
  }));
  $("memberList").querySelectorAll("[data-reset]").forEach(btn=>btn.addEventListener("click",async()=>{
    const password=window.prompt("Enter a new temporary password (at least 12 characters) for this account:");
    if(password===null)return;
    if(password.length<12){notice("appMessage","Use a password with at least 12 characters.","error");return;}
    const {data,error}=await supabase.functions.invoke("campaign-staff-account",{body:{action:"reset_password",user_id:btn.dataset.reset,password}});
    if(error)notice("appMessage",error.message,"error");
    else if(data?.error)notice("appMessage",data.error,"error");
    else notice("appMessage","Password reset. Share the new temporary password securely.","good");
  }));
}
$("memberForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const username=$("memberUsername").value.trim().toLowerCase(),password=$("memberPassword").value,role=$("memberRole").value;
  const button=$("memberForm").querySelector('button[type="submit"]');setBusy(button,true);
  try{
    const {data,error}=await supabase.functions.invoke("campaign-staff-account",{body:{username,password,role}});
    if(error)throw error;
    if(data?.error)throw new Error(data.error);
    $("memberUsername").value="";$("memberPassword").value="";
    notice("appMessage","Account created for @"+data.username+". Give the staff member their username and temporary password securely.","good");
    await loadMembers();
  }catch(err){notice("appMessage",err.message||"Could not create staff account.","error");}
  finally{setBusy(button,false,"Create account");}
});

$("passwordForm").addEventListener("submit",async e=>{
  e.preventDefault();const password=$("newPassword").value;
  const button=$("passwordForm").querySelector('button[type="submit"]');setBusy(button,true);
  try{
    const {error}=await supabase.auth.updateUser({password});
    if(error)throw error;
    $("newPassword").value="";
    notice("appMessage","Your password has been changed.","good");
  }catch(err){notice("appMessage",err.message||"Could not change password.","error");}
  finally{setBusy(button,false,"Change password");}
});
