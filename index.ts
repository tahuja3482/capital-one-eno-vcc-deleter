import puppeteer from "puppeteer";
import config from "./config.json";
import async from "async";
var cardData = [];
class DeleteTask {
  numDeleted: number;
  username: string;
  password: string;
  name: string;
  browser: puppeteer.Browser;

  constructor(username: string, password: string, name: string) {
    this.numDeleted = 0;
    this.username = username;
    this.password = password;
    this.name = name;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: false,
      executablePath: config.chrome_path,
    });
    var page = await this.browser.newPage();

    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      interceptReq(request);
    });
    page.on("response", async (response) => {
      interceptRes(response);
    });

    page.setDefaultTimeout(10000);
    await page.goto("https://verified.capitalone.com/auth/signin", {
      waitUntil: "networkidle2",
    });
    page.waitForXPath('//*[@id="ods-input-0"]');
    var res = await page.$x('//*[@id="ods-input-0"]');
    await res[0].type(this.username);

    page.waitForXPath('//*[@id="ods-input-1"]');
    var res2 = await page.$x('//*[@id="ods-input-1"]');
    await res2[0].type(this.password);

    const button = await page.$x(
      "/html/body/app-root/div/div/app-sign-in/ci-content-card/div/div/ngx-ent-signin/form/p[2]/button"
    );
    await button[0].click();

    await verifyLogin(page);

    await page.goto("https://myaccounts.capitalone.com/VirtualCards", {
      waitUntil: "networkidle0",
      timeout: 0,
    });
    var found: number = 0;
    var taskList = [];
    for (var i = 0; i < cardData.length; i++) {
      for (var j = 0; j < cardData[i].data.entries.length; j++) {
        if (cardData[i].data.entries[j].tokenName.includes(this.name)) {
          found++;
          var json = {};
          json["reference"] = cardData[i].reference;
          json["token"] = cardData[i].data.entries[j].tokenReferenceId;
          taskList.push(json);
        }
      }
    }
    console.log(`${found} cards found with the matching keyword!`);

    var deleted: number = 0;
    setTerminalTitle(
      "Capital One Eno VCC Deleter | Deleting Cards with Keyword: " +
        this.name +
        " | Deleted: " +
        deleted +
        "/" +
        found
    );

    var q = async.queue(async (task, callback) => {
      console.log(`Deleting Card ${task.token}`);
      var taskWindow = await this.browser.newPage();
      await taskWindow.goto(
        `https://myaccounts.capitalone.com/VirtualCards/editVirtualCard?tokenRef=${task.token}&cardRef=${task.cardRef}&reveal=false`,
        { waitUntil: "networkidle0" }
      );

      await taskWindow.evaluate(
        'document.getElementsByClassName("deleteLink vc-delete-button c1-ease-button--full-width c1-ease-button c1-ease-button--progressive c1-ease-button--text")[0].click()'
      );
      await sleep(300);
      //await page.evaluate('document.getElementsByClassName("deleteButton c1-ease-button--full-width c1-ease-button c1-ease-button--destructive")[0].click()')
      await taskWindow.close();
      console.log(`${task.token} successfully deleted!`);
      deleted++;
      setTerminalTitle(
        "Capital One Eno VCC Deleter | Deleting Cards with Keyword: " +
          this.name +
          " | Deleted: " +
          deleted +
          "/" +
          found
      );
      callback();
    }, config.task_amount);

    q.push(taskList, function (err) {});

    q.drain(async () => {
      console.log("All selected cards have been deleted.");
      await this.browser.close()
    });
  }
}

async function verifyLogin(page) {
  var link = await page.evaluate("window.location.href");
  if (!link.startsWith("https://myaccounts.capitalone.com/accountSummary")) {
    await page.waitForNavigation({
      waitUntil: "load",
      timeout: 0,
    });
    link = await page.evaluate("window.location.href");
    verifyLogin(page);
  }
  return;
}

async function interceptReq(request) {
  await request.continue();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function interceptRes(response) {
  if (
    response._url.startsWith(
      "https://myaccounts.capitalone.com/ease-app-web/customer/virtualcards/tokens?cardReferenceId="
    )
  ) {
    var reference = response._url.split("cardReferenceId=")[1];
    var data = await response.json();
    if (data["entries"]) {
      var json = { reference: reference, data: data };
      cardData.push(json);
    }
  }
}

function setTerminalTitle(title) {
  process.stdout.write(
    String.fromCharCode(27) + "]0;" + title + String.fromCharCode(7)
  );
}

function main() {
  console.clear();
  setTerminalTitle("Capital One Eno VCC Deleter");
  const prompt = require("prompt-sync")();
  const kw = prompt("Enter the keyword of the cards you want to delete: ");
  setTerminalTitle(
    "Capital One Eno VCC Deleter | Deleting Cards with Keyword: " + kw
  );
  var task = new DeleteTask(config.username, config.password, kw);
  task.initialize();
}

main();
