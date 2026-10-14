const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

for (const theme of ['light','dark']) {
  for (const [screen,width] of [['desktop',1440],['mobile',393]]) {
    for (const role of ['guest','member','admin']) {
      test(`${theme} ${screen} ${role}: Account follows Dashboard only when signed in`,async({page})=>{
        const user=role==='guest'?null:{id:9999,email:'fixture@local.test',plan:'free',isAdmin:role==='admin'};
        await page.setViewportSize({width,height:900});
        await page.addInitScript(value=>localStorage.setItem('ss-theme',value),theme);
        await page.route('**/*',route=>{
          const url=new URL(route.request().url());
          if(url.hostname!=='127.0.0.1')return route.abort();
          if(!url.pathname.startsWith('/api/'))return route.continue();
          const body=url.pathname==='/api/auth/me'?{user}
            :url.pathname==='/api/admin/status'?{unlocked:false,emailConfigured:false,smsConfigured:false,twoFactor:{channel:'none'}}
            :url.pathname==='/api/study/sessions'?{sessions:[],nextCursor:null}
            :url.pathname==='/api/study/flashcard-reviews'?{reviews:[]}
            :url.pathname.startsWith('/api/premade')?{quizzes:[],nextCursor:null}
            :url.pathname==='/api/billing/config'?{premiumEnabled:false,providers:{},ads:{enabled:false}}
            :{community:{},you:{}};
          return route.fulfill({json:body});
        });
        for(const path of ['/','/practice','/premade','/dashboard','/admin']) {
          await page.goto(path);
          if(role==='guest'&&path==='/dashboard')await expect(page).toHaveURL(/\/$/);
          if(screen==='mobile')await page.locator('#mobileNavToggle').click();
          const nav=page.locator(screen==='mobile'?'#mobileNavDrawer':'.nav-desktop');
          const account=nav.getByRole('link',{name:'Account',exact:true});
          if(!user)await expect(account).toBeHidden();
          else {
            await expect(account).toBeVisible();
            const links=await nav.locator('a,button').evaluateAll(items=>items.filter(item=>getComputedStyle(item).display!=='none').map(item=>item.textContent.trim()));
            expect(links.indexOf('Account')).toBe(links.indexOf('Dashboard')+1);
            if(role==='admin')expect(links.indexOf('Admin')).toBe(links.indexOf('Account')+1);
          }
        }
        fs.mkdirSync('.local/artifacts',{recursive:true});
        await page.screenshot({path:`.local/artifacts/navigation-${role}-${theme}-${screen}.png`});
      });
    }
  }
}
