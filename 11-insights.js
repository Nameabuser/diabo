/* Local charts and exports. No network, no additional synced fields. */
(function(root){
'use strict';
function baseTag(tag){return String(tag||'').split('|date=')[0];}
function dateOnly(r){var m=/\|date=(\d{4}-\d{2}-\d{2})$/.exec(String(r.tag||''));return m?m[1]:'';}
function valid(rows){return rows.filter(function(r){return r&&Number.isFinite(Number(r.value))&&Number(r.value)>=20&&Number(r.value)<=600&&Number.isFinite(r.ts);}).map(function(r){return dateOnly(r)?Object.assign({},r,{ts:new Date(dateOnly(r)+"T00:00:00").getTime()}):r;}).sort(function(a,b){return b.ts-a.ts||Number(String(b.id).split("-")[0])-Number(String(a.id).split("-")[0])||String(b.id).localeCompare(String(a.id));});}
function startDay(now,days){return new Date(now.getFullYear(),now.getMonth(),now.getDate()-(days-1)).getTime();}
function period(rows,days,now){var end=now.getTime(),start=startDay(now,days),list=valid(rows).filter(function(r){return r.ts>=start&&r.ts<=end;});return {rows:list,count:list.length,average:list.length?Math.round(list.reduce(function(s,r){return s+Number(r.value);},0)/list.length):null,start:start,end:end};}
function series(rows,days,now){var data=period(rows,days,now).rows,out=[];for(var i=days-1;i>=0;i--){var d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i),e=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1),a=data.filter(function(r){return r.ts>=d.getTime()&&r.ts<e.getTime();});out.push({date:d,average:a.length?Math.round(a.reduce(function(s,r){return s+Number(r.value);},0)/a.length):null,count:a.length});}return out;}
function isRange(r){return r&&Number.isFinite(Number(r.low))&&Number.isFinite(Number(r.high))&&r.low>=20&&r.high<=600&&Number(r.low)<Number(r.high);}
function rangeStats(rows,days,now,range){var p=period(rows,days,now),counts=[0,0,0],legacy=isRange(range),all=range||{};if(!legacy&&!isRange(all.morning)&&!isRange(all.other))return null;var excluded=0;p.rows.forEach(function(r){var t=baseTag(r.tag),chosen=legacy?range:t==='fasting'||t==='morning'?all.morning:t==='before meal'||t==='after meal'||t==='afternoon'||t==='evening'||t==='midnight'?all.other:null;if(!isRange(chosen)){excluded++;return;}counts[Number(r.value)<Number(chosen.low)?0:Number(r.value)>Number(chosen.high)?2:1]++;});var count=counts.reduce(function(a,b){return a+b;},0),perc=counts.map(function(c){return count?c*100/count:0;}),rounded=perc.map(Math.floor),remaining=count?100-rounded.reduce(function(a,b){return a+b;},0):0;perc.map(function(v,i){return {i:i,part:v-rounded[i]};}).sort(function(a,b){return b.part-a.part||a.i-b.i;}).slice(0,remaining).forEach(function(v){rounded[v.i]++;});return {count:count,total:p.count,excluded:excluded,counts:counts,percent:rounded,widths:perc,low:legacy?Number(range.low):null,high:legacy?Number(range.high):null};}
function label(tag){tag=baseTag(tag);return {fasting:'Morning','before meal':'Afternoon','after meal':'Evening',morning:'Morning',afternoon:'Afternoon',evening:'Evening',midnight:'Midnight'}[tag]||String(tag||'');}
function csvCell(s){s=String(s);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function csv(rows){return '\ufeff'+[['Timestamp (UTC)','Date/time (device local)','Glucose (mg/dL)','Time of day']].concat(valid(rows).map(function(r){return [dateOnly(r)?'':new Date(r.ts).toISOString(),dateOnly(r)||new Date(r.ts).toLocaleString('en-IN',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}),r.value,label(r.tag)];})).map(function(row){return row.map(csvCell).join(',');}).join('\r\n')+'\r\n';}
function ascii(s){return String(s).replace(/[^\x20-\x7e]/g,'?').replace(/[\\()]/g,'\\$&');}
function pdf(rows,now){
  var list=valid(rows);
  var zone='device local';
  try{zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'device local';}catch(e){}
  var ranges={morning:{low:90,high:115},other:{low:80,high:180}};
  try{
    if(root.Diabo&&root.Diabo.ranges){
      var rr=root.Diabo.ranges();
      if(isRange(rr))ranges={morning:{low:Number(rr.low),high:Number(rr.high)},other:{low:Number(rr.low),high:Number(rr.high)}};
      else if(rr&&isRange(rr.morning)&&isRange(rr.other))ranges={morning:{low:Number(rr.morning.low),high:Number(rr.morning.high)},other:{low:Number(rr.other.low),high:Number(rr.other.high)}};
    }
  }catch(e){}
  var MR=ranges.morning,OR=ranges.other;
  function rowRange(r){var t=baseTag(r.tag);return (t==='fasting'||t==='morning')?MR:(t==='before meal'||t==='after meal'||t==='afternoon'||t==='evening'||t==='midnight')?OR:null;}
  function statusOf(r){var g=rowRange(r);if(!g)return null;var v=Number(r.value);return v<g.low?0:v>g.high?2:1;}
  var W=595,H=842,ML=40,MRX=555;
  var INK=[0.07,0.07,0.07],GREY=[0.42,0.42,0.42],FAINT=[0.6,0.6,0.6],CARD=[0.955,0.955,0.955],ZEBRA=[0.972,0.972,0.972],GREEN=[0.43,0.62,0.56],BAND=[0.91,0.945,0.92],ORANGE=[0.82,0.63,0.5],RED=[0.73,0.49,0.49],WHITE=[1,1,1],GRID=[0.88,0.88,0.88];
  var ICON='s4IA0!"_al8O`[\\!<<*#!!*\'"s4[N@!!EB+!s8T-!s8W."9\\l4$3g\\<"U5A@#mUeI$kEgX$k3XV&Jc#j&/>cd%20Wn\'c.]))&Wqt)]]k7*>TJ0)#r=j6NI;m"9o#6$O-eC(_@,f(`4),(`4),(`4),(`4),(`4),(`4),(`4),(`4),(`4),(`4),(`4),(`4),(`<:g!"fJ:?iXR:!?qLF&HMtG!WU(<)ZTm>!!<6&!<<*"z!!!!("9eu8!<`A?!\'(Sj!<WE*"9Sf2#6b)-!!!!"!!36*"U52D&g8tq\'2`0D\'I"bW(.)JMJe]+J1K&dd1cIdBU&W%2)$\'a<!s&E&zz!!!!#!sJ].s24mg&HDh6!s/Z-"9JZ*z!!*\'$!tc\\2"CVHH5uDWQ\'-`RDn=egH_9r;:!"8r1!!3`7&HG#qp[TLP+sJ3T,/CnK/bo#u?[]O]+JGI+I8*,-m]ha(EV8BR+Z-`8CJ0J!7EWqFMf#t%?0p(->C=;&9"8#$%#sKE4e^+bg^pcR#U%Kg+sQ"j+sJ3T+sJ3T-mlE..Q%`"Z=jDrGoA:]QRn;s"4!4i)hHr)Z_VO?I\\+habtQV+7[[tm_^rEk0`uYLl\'d&^WSP]VS*K&5!%5)5ZmPmdj7Wk8Djl50D3[^DmZ2>M9],WES)bF8b^&dVTm>brcbr!Armnf7UJ/S.IRT[:]D-8kcn/"Eh5bO"V=-aV8_iWt1@m)tBb*8JA)4dm*bCi1T.RkF<QR]&k7>4]m5he26r$g>\\^Q@=^[^qdq=O+0YJ\\:KlJ%^6PD*TAD"@b;jd$5NC)Zk8XP`;OkiOtKc#>6uTclORi]T$VqHW"h\'=;PB/F,B1p%7U3A"qkT,4mFN6psF26ptB\'p9B>?E,/W9,b9GnlA06$7<lLI=nG2nX"[n$Sc/DaSS0V"rcG\'Z\\,t(@Z\\MEm,_%%R]imQJeOh%jK-^-ljSB6UO#-N^f9;ZQ[*,B"D+gP-`8U2jlc7UT7s6\\T&*a!XH7<RuChD(M@FjdS_b)A[oFSG:@i]_58Nkj(jIYFq[gFiDZrH,J=g-@6GD=*c`n@,)kAuiu&\\).jV;q8tfCNp)b0tahW4JP<m2_q`m]>tqEd$e0G%\':U/"4fRM`.;Djj+OQa2LVS(C6.uie?E^,]D[XJ0Xu6.4Yd[>EP!&f6DbDYrKc]j*dKtLtir1[oLlL73\'Z*cM:gZ]4nuuoCfd-S5@a,j3Fs&DimpVk!PR;-bgjSV.3D_iU,b7NF&%,BhV:83qjKpCdl_`\'\\Alf&J5OB"jg@URHc]\'CF*J<8M2q\\fr].9573:;Ar[rUkA3qp<P%O/()kXr^Pj;!K5^&64+HOWq^2ZaFNe-sI)>0D0:@=&ahIbSLYc\'m-h73:<j%hfH5Yc]-*?fbM>QjtC./oi>qjd!6+g\\"=<;L&kcN=EoeDl2MfMH`AKDrEk(^Bb]9b^ob-T+>2C>j#j)=u7D78WP=P"2F#flMKP//(\\N^h(rF_WtGR\'2dVafi)(^)M49lQM^3HYk%9P",V!T(^1@iYjr)bDXbR@%c(e)QP$UZIN,a93CI>@%\'A0iXK[SCVTtgB+Dgh^ZN-JY9UC53+^,T^Wk_AW1\\7=*Oq#_5gVU\'`./)55[UpR$X=PA.C7bR[aE>:SWpD.[LNd%`N`ei#BT(n\\80E#DTZf)DNq]ZRZg#%g=[2+OJ=k6_h.bZC#5[aI&^tq6,g#H%>9_*EDsF*olrV!!!ir$3[fKc:\\u_\\0ot<`7;as=IOC-0f5;mR*>Ba)g]kgnm\'"t]I4Q!NrCuni,Q+P*&J8?Td1Hs,_D_f6TX@J2oA&e(.o1jVWoYP\\f%4s4BPIfl/b9Ek!;a64\'SfgJlMG_7>\'2Vrh]*NR42p,4k@RtuO#PM/k]]-NpEXe:EC@U"83228T+7!D&(8O4,c(g_E5=VH*l-<-QOfN`lIYF%.eN`#MAdWK"OoB?-3VH/IQ#:cl*eK=4!)$)`R=]l`cX>lp/3pEbP`g3\\CbSG$E?)k-N_c%F*Hj+5<Y&R6<!_lD-Ce^V8"X7E[>+lki#D9fT/Wj6`+"p?%8W\\lQ/W7\\C&Ysg6u8ib6t&=nV>R=c@<ed%q_D;rr@#=kb\\-XXS.W:ViJl5VKP=q=7$a3+/AVmOm`\'O+E\'/-3g+c[h8kCf+U"\'Ojj`f\\)]M7#!!/a8Yd!Oep/`oI1Q:qZ?Vg=6Ms"#AVu\'D=f^@C]&DE\\8olJGT-N^IRU6fQ=Rp>I;7E6XsC>!UOngT9(ij$*,_tPV?5L@2hji`+CJ5m;:)njoS4@Ve?RWsfq_+OG^-cKm[!>,oKZ]Ph3&J5Thf24@d#Llr@mhN\',g+iqWn1V4q^"TTAFPXiupA@1J+r;F[n(Kh<%5p5K[bJJ4q?B<%%[j*C7Y_e/AR5sHkSR$5G-]MRMJ=ADN0*1\\#6=%6W&4.>maFC6*0HiYQYV"4Y))Xr=O"7Xb44O=G0XjjFR)EcI55Wh()dKo0!uedD\\i^Cii[bp.1\\[kS$;M?GNb$;NBGlUh/[B^W0N)eL:$Sd%0t,XYI^GP/!bK*+sR\'?~>';
  var HW=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  function tw(s,size){var w=0;s=String(s);for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);w+=(c>=32&&c<=126)?HW[c-32]:556;}return w*size/1000;}
  function N(x){return String(Math.round(x*100)/100);}
  var pages=[],ops=null;
  function newPage(){ops=[];pages.push(ops);}
  function col(c){ops.push(c.map(N).join(' ')+' rg');}
  function scol(c){ops.push(c.map(N).join(' ')+' RG');}
  function rect(x,y,w,h,c){col(c);ops.push(N(x)+' '+N(H-y-h)+' '+N(w)+' '+N(h)+' re f');}
  function hline(x1,x2,y,w,c){scol(c);ops.push(N(w)+' w '+N(x1)+' '+N(H-y)+' m '+N(x2)+' '+N(H-y)+' l S');}
  function text(x,y,s,font,size,c){col(c);ops.push('BT /'+font+' '+N(size)+' Tf '+N(x)+' '+N(H-y)+' Td ('+ascii(s)+') Tj ET');}
  function rtext(x,y,s,font,size,c){text(x-tw(s,size),y,s,font,size,c);}
  function circle(x,y,r,c){col(c);var k=0.552*r,yy=H-y;ops.push(N(x+r)+' '+N(yy)+' m '+N(x+r)+' '+N(yy+k)+' '+N(x+k)+' '+N(yy+r)+' '+N(x)+' '+N(yy+r)+' c '+N(x-k)+' '+N(yy+r)+' '+N(x-r)+' '+N(yy+k)+' '+N(x-r)+' '+N(yy)+' c '+N(x-r)+' '+N(yy-k)+' '+N(x-k)+' '+N(yy-r)+' '+N(x)+' '+N(yy-r)+' c '+N(x+k)+' '+N(yy-r)+' '+N(x+r)+' '+N(yy-k)+' '+N(x+r)+' '+N(yy)+' c f');}
  function poly(pts,w,c){if(pts.length<2)return;scol(c);var s=N(w)+' w ';pts.forEach(function(p,i){s+=N(p[0])+' '+N(H-p[1])+(i?' l':' m')+' ';});ops.push(s+'S');}
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function p2(n){return String(n).padStart(2,'0');}
  function dShort(d){return WD[d.getDay()]+', '+d.getDate()+' '+MON[d.getMonth()];}
  function dFull(d){return d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear();}
  function t12(d){var h=d.getHours(),ap=h<12?'AM':'PM';h=h%12||12;return h+':'+p2(d.getMinutes())+' '+ap;}
  function plural(n,w){return n+' '+w+(n===1?'':'s');}
  var p7=period(list,7,now),p30=period(list,30,now),p90=period(list,90,now);
  var stats=rangeStats(list,30,now,ranges);
  var y=0;
  newPage();
  ops.push('q 34 0 0 34 38 '+N(H-66)+' cm /Im1 Do Q');
  text(78,46,'Diabo','F2',20,INK);
  text(78,62,'My glucose log','F1',9.5,GREY);
  rtext(MRX,42,'Report made on '+dFull(now),'F1',9,GREY);
  rtext(MRX,56,'Times shown in '+zone,'F1',8,FAINT);
  hline(ML,MRX,76,1.4,INK);
  y=106;
  if(!list.length){
    text(ML,y,'No readings yet.','F2',15,INK);y+=20;
    text(ML,y,'Add readings in the app and they will show up here.','F1',9.5,GREY);
  }else{
    text(ML,y,'Your average over the last 30 days was '+(p30.average===null?'--':p30.average)+' mg/dL','F2',15,INK);y+=19;
    if(stats&&stats.count)text(ML,y,stats.percent[1]+'% of your readings were in range ('+stats.counts[1]+' of '+stats.count+').','F2',10.5,GREEN);
    else text(ML,y,'Tag readings as morning, afternoon or evening to see time in range.','F1',9.5,GREY);
    y+=15;
    text(ML,y,'Readings from '+dFull(new Date(list[list.length-1].ts))+' to '+dFull(now)+' - '+plural(list.length,'reading')+' in total','F1',8.5,FAINT);y+=24;
    var cw=(MRX-ML-24)/3;
    [['LAST 7 DAYS',p7],['LAST 30 DAYS',p30],['LAST 90 DAYS',p90]].forEach(function(pair,i){
      var x=ML+i*(cw+12);
      rect(x,y,cw,58,CARD);
      text(x+12,y+15,pair[0],'F2',7.5,FAINT);
      text(x+12,y+38,(pair[1].average===null?'--':String(pair[1].average))+' mg/dL','F2',15,INK);
      text(x+12,y+51,plural(pair[1].count,'reading'),'F1',8,GREY);
    });
    y+=76;
    var lx=ML;
    [['In range',GREEN],['Below target',ORANGE],['Above target',RED]].forEach(function(it){circle(lx+4,y-3.2,3.6,it[1]);text(lx+12,y,it[0],'F1',9,INK);lx+=12+tw(it[0],9)+22;});
    y+=15;
    text(ML,y,'Targets: morning '+MR.low+' to '+MR.high+' mg/dL. Afternoon and evening '+OR.low+' to '+OR.high+' mg/dL. Averages count all readings in those days.','F1',7.8,FAINT);
    y+=24;
    var s30=series(list,30,now);
    var avgs=s30.map(function(d){return d.average;}).filter(function(a){return a!==null;});
    text(ML,y,'HOW YOUR DAILY AVERAGE MOVED (LAST 30 DAYS)','F2',8,FAINT);y+=13;
    if(avgs.length){
      var lo=MR.low,hi=MR.high;
      avgs.forEach(function(a){lo=Math.min(lo,a);hi=Math.max(hi,a);});
      var y0=Math.max(0,Math.floor((lo-8)/20)*20),y1=Math.min(620,Math.ceil((hi+8)/20)*20);
      var cx=66,cw2=MRX-cx,ch=125,cy=y;
      var vy=function(v){return cy+ch*(1-(v-y0)/(y1-y0));};
      rect(cx,vy(MR.high),cw2,vy(MR.low)-vy(MR.high),BAND);
      for(var g=y0;g<=y1;g+=20){hline(cx,MRX,vy(g),0.4,GRID);rtext(cx-6,vy(g)+2.5,String(g),'F1',8,FAINT);}
      hline(cx,MRX,cy+ch,0.6,FAINT);
      var bw=Math.max(4,cw2/30*0.55);
      s30.forEach(function(d,i){
        if(d.average===null)return;
        var d0=new Date(d.date.getFullYear(),d.date.getMonth(),d.date.getDate()).getTime(),d1=d0+86400000;
        var sts=list.filter(function(r){return r.ts>=d0&&r.ts<d1;}).map(statusOf).filter(function(st){return st!==null;});
        var st=!sts.length?null:(sts.indexOf(2)>=0?2:sts.indexOf(0)>=0?0:1);
        var x=cx+cw2*(s30.length>1?i/(s30.length-1):0.5);
        rect(x-bw/2,vy(d.average),bw,(cy+ch)-vy(d.average),st===null?FAINT:[ORANGE,GREEN,RED][st]);
      });
      for(var i=0;i+7<s30.length;i+=7){var dd=s30[i].date;text(cx+cw2*i/(s30.length-1)-8,cy+ch+13,dd.getDate()+' '+MON[dd.getMonth()],'F1',8,FAINT);}
      var dl=s30[s30.length-1].date;rtext(MRX,cy+ch+13,dl.getDate()+' '+MON[dl.getMonth()],'F1',8,FAINT);
      y=cy+ch+26;
    }else{y+=8;}
    y+=6;
    text(ML,y,'YOUR READINGS','F2',8,FAINT);
    y+=14;
    var COLS={date:ML,val:200,tag:300,status:420};
    var headerRow=function(){rect(ML,y-11,MRX-ML,17,[0,0,0]);text(COLS.date,y,'DATE','F2',7.2,WHITE);text(COLS.val,y,'MG/DL','F2',7.2,WHITE);text(COLS.tag,y,'TIME OF DAY','F2',7.2,WHITE);text(COLS.status,y,'STATUS','F2',7.2,WHITE);y+=12;};
    headerRow();
    var SN=['Below target','In range','Above target'],SC=[ORANGE,GREEN,RED];
    list.forEach(function(r,idx){
      if(y>786){newPage();y=56;headerRow();}// row band ends at y+6; keep it 8pt above the footer line at 800
      if(idx%2===0)rect(ML,y-10.5,MRX-ML,16.5,ZEBRA);
      var d=new Date(r.ts),only=dateOnly(r);
      text(COLS.date,y,dShort(d),'F1',9,INK);
      text(COLS.val,y,String(r.value),'F2',9.5,INK);
      text(COLS.tag,y,label(r.tag)||'-','F1',9,INK);
      var st=statusOf(r);
      if(st===null)text(COLS.status,y,'-','F1',9,FAINT);
      else{circle(COLS.status+3.2,y-3,2.8,SC[st]);text(COLS.status+10,y,SN[st],'F1',9,SC[st]);}
      y+=16.5;
    });
  }
  pages.forEach(function(p,i){
    ops=p;
    hline(ML,MRX,800,0.5,GRID);
    text(ML,813,'Tracker only, not medical advice. Share this log with your doctor if you like.','F1',7.5,FAINT);
    rtext(MRX,813,'Page '+(i+1)+' of '+pages.length,'F1',7.5,FAINT);
  });
  var kids=pages.map(function(_,i){return (5+i*2)+' 0 R';});
  var imgId=5+pages.length*2;
  var objs=[];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+pages.length+' >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  pages.forEach(function(p,i){
    var stream=p.join('\n')+'\n';
    objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im1 '+imgId+' 0 R >> >> /Contents '+(6+i*2)+' 0 R >>');
    objs.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
  });
  objs.push('<< /Type /XObject /Subtype /Image /Width 96 /Height 96 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCII85Decode /DCTDecode] /Length '+ICON.length+' >>\nstream\n'+ICON+'\nendstream');
  var out='%PDF-1.4\n',offset=[0];
  objs.forEach(function(obj,i){offset.push(out.length);out+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});
  var x=out.length;
  out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+offset.slice(1).map(function(n){return String(n).padStart(10,'0')+' 00000 n \n';}).join('')+'trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R >>\nstartxref\n'+x+'\n%%EOF\n';
  return out;
}
var api={valid:valid,period:period,series:series,rangeStats:rangeStats,csv:csv,pdf:pdf};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(!root.document)return;root.DiaboInsights=api;
var el=function(id){return document.getElementById(id);},days=7,tirDays=30;
function renderRange(rows,now){var range;try{range=root.Diabo.ranges();}catch(e){}var stats=rangeStats(rows,tirDays,now,range);el('tir-data').classList.toggle('hidden',!stats||!stats.count);el('tir-empty').classList.toggle('hidden',!!stats&&!!stats.count);el('tir-empty').textContent=!stats?'No tagged readings yet.':stats.total?'No tagged readings in the last '+tirDays+' days.':'No readings in the last '+tirDays+' days.';if(!stats||!stats.count)return;el('tir-value').textContent=stats.percent[1]+'%';el('tir-summary').textContent=stats.counts[1]+' of '+stats.count+' reading'+(stats.count===1?'':'s')+' within reference';var names=['Below','Within reference','Above'],classes=['range-below','range-within','range-above'];el('tir-bar').setAttribute('aria-label',names.map(function(n,i){return n+' '+stats.percent[i]+' percent';}).join(', '));el('tir-bar').innerHTML=classes.map(function(c,i){return '<span class="'+c+'" style="width:'+stats.widths[i]+'%"></span>';}).join('');el('tir-legend').innerHTML=names.map(function(n,i){return '<span><i class="'+classes[i]+'" aria-hidden="true"></i>'+n+' '+stats.percent[i]+'%</span>';}).join('');}
function render(){var rows=root.Diabo.load(),now=new Date(),p=period(rows,days,now),bars=series(rows,days,now),max=Math.max.apply(null,bars.map(function(b){return b.average||0;}))||1;el('chart-title').textContent=days===7?'Your week':'Your month';el('chart-date-range').textContent=bars[0].date.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+' - '+now.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});el('chart-summary').textContent=(p.average===null?'--':p.average)+' mg/dL average · '+p.count+' reading'+(p.count===1?'':'s');el('week-chart').innerHTML='<div class="week-bars '+(days===30?'month-bars':'')+'">'+bars.map(function(b,i){var text=days===7?b.date.toLocaleDateString('en-IN',{weekday:'short'})+'<span class="week-date">'+b.date.getDate()+'</span>':((i%5===0||i===29)?b.date.getDate():'');return '<div class="day-bar" aria-label="'+b.date.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+': '+(b.average===null?'no readings':b.average+' mg/dL average, '+b.count+' reading'+(b.count===1?'':'s'))+'"><span class="bar-value">'+(days===7?(b.average===null?'·':b.average):'')+'</span><div class="bar" style="height:'+(b.average===null?3:Math.max(8,90*b.average/max))+'px;'+(b.average===null?'opacity:.12':'')+'"></div><span class="bar-label">'+text+'</span></div>';}).join('')+'</div>';el('week-caption').textContent='Last '+days+' calendar days, including today · daily averages · bars from zero · missing days stay blank';[30,90].forEach(function(n){var a=period(rows,n,now);el('avg-'+n).textContent=a.average===null?'--':a.average;el('count-'+n).textContent=a.count+' reading'+(a.count===1?'':'s');});renderRange(rows,now);document.querySelectorAll('[data-chart-days]').forEach(function(b){b.setAttribute('aria-pressed',String(Number(b.dataset.chartDays)===days));});}
api.render=render;document.querySelectorAll('[data-chart-days]').forEach(function(b){b.addEventListener('click',function(){days=Number(b.dataset.chartDays);render();});});var tirSel=el('tir-period');if(tirSel)tirSel.addEventListener('change',function(){tirDays=Number(tirSel.value)||7;render();});window.addEventListener('diabo-render',render);render();
async function exportFile(type){if(document.body.classList.contains('app-locked')||!el('app-gate').classList.contains('hidden')&&!document.documentElement.classList.contains('owner-ready'))return;var now=new Date(),rows=root.Diabo.load(),name='diabo-readings-'+now.toISOString().slice(0,10)+'.'+type,mime=type==='pdf'?'application/pdf':'text/csv;charset=utf-8',data=type==='pdf'?pdf(rows,now):csv(rows),blob=new Blob([data],{type:mime}),file=new File([blob],name,{type:mime});try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Diabo reading log'});el('export-status').textContent='Export shared.';}else{var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);el('export-status').textContent='Export opened. Save the file in your browser or Files.';}}catch(e){el('export-status').textContent=e.name==='AbortError'?'Export cancelled.':'Could not export. Try the other format or reopen in Safari.';}}
el('export-file').addEventListener('click',function(){exportFile(el('export-format').value==='csv'?'csv':'pdf');});
})(typeof window!=='undefined'?window:globalThis);
