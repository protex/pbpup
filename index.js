#!/usr/bin/env node
"use strict";
var webdriver = require("selenium-webdriver");
var inquirer = require("inquirer");
var clear = require("clear");
var figlet = require("figlet");
var chalk = require("chalk");
var CLI = require("clui"),
  Spinner = CLI.Spinner;
var CLC = require("cli-color");
var cp = require("child_process");
var clipboard = require("clipboardy").writeSync;
var configstore = require("configstore");
var chromedriver = require('chromedriver');

// Variable to store the info for the current configuration
// This will be populated by config store
var info = {
  userId: "",
  forum: "",
  pluginName: "",
  usrName: "",
  buildCommand: ""
};
// Variable to stor the current config name
var currentConfigName;

// Initialize config store
const conf = new configstore("PbPup");
// Helper function to always use currentConfigName when setting
conf.curSet = (key, value) => conf.set(currentConfigName + "." + key, value);

// Default countdown spinner
var countdown = new Spinner("", ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"]);
countdown.newMessage = message => countdown.message(chalk.green(message));

// Start the chromedriver
chromedriver.start();


// Start the webdriver (open the browser and connect to it)
var browser = new webdriver.Builder()
  .usingServer()
  .withCapabilities({ browserName: "chrome" })
  .build();

process.on('SIGINT', function() {
  quit();
});

/*
 * @function quit
 * @description Cleans up browser and chromedriver and
 *  shuts down the process
 * @params none
 * @return none
 */
async function quit() {
  if (!browser.toString().includes('null')) {
    await browser.quit();
    await chromedriver.stop();
  }
  process.exit();
}

/*
 * @function async goToLogin
 * @description Goes to the login page of the current
 *  forum by clicking on the login link from the main
 *  page
 * @params none
 * @returns none
 */
async function goToLogin() {
  try {
    // Click login link
    await browser
      .findElement(
        webdriver.By.css('a[href*="https://login.proboards.com/login"]')
      )
      .click();
  } catch (err) {
    console.log(err);
  }
}

/*
 * @function async checkCaptcha
 * @description Detects captcha presence on login page
 *  and prompts user to pass captcha manually if it
 *  is present
 * @params none
 * @returns none
 */
async function checkCaptcha() {
  var bodyText = await browser
    .findElement(webdriver.By.tagName("body"))
    .getText();
  var cont = false;
  // Check if the text in the body of the browser
  // Contains the captcha message
  if (/Please prove you are human/.test(bodyText)) {
    var captcha = true;
    cont = true;
    do {
      await inquirer.prompt([
        {
          name: "name",
          type: "input",
          message: "Validate captcha and press enter to continue..."
        }
      ]);
      // Perform check again to make sure captcha was passed
      captcha = /Please prove you are human/.test(
        await browser.findElement(webdriver.By.tagName("body")).getText()
      );
    } while (captcha);
  } return cont;
}

/*
 * @function logIn
 * @description Prompts the user for login credentials
 *  and logs them in
 * @params none
 * @returns none
 */
async function logIn() {
  try {
    var cont;

    do {
      cont = false;
      // Request username if current config doesn't have one
      if (!conf.get(currentConfigName + ".usrName")) {
        var usrName = await inquirer.prompt([
          {
            name: "usrName",
            type: "input",
            message: "Enter your username or email:",
            validate: message => {
              if (message.length) return true;
              else return "Please enter a valid username or email";
            }
          }
        ]);
        conf.curSet("usrName", usrName.usrName);
      }
      var password = await inquirer.prompt([
        {
          name: "password",
          type: "password",
          message: "Enter your password:",
          validate: message => {
            if (message.length) return true;
            else return "Please enter a valid password";
          }
        }
      ]);
      // Input username
      await browser.executeScript(
        "document.getElementsByName('email')[0].setAttribute('value', '" +
          conf.get(currentConfigName + ".usrName") +
          "')"
      );
      // Input password
      await browser
        .findElement(webdriver.By.name("password"))
        .sendKeys(password.password);
      password.password = "";
      countdown.newMessage("Attempting to log in...");
      countdown.start();
      // Click login button
      await browser.findElement(webdriver.By.name("continue")).click();
      countdown.stop();

      cont = await checkCaptcha();
      var bodyText = await browser
        .findElement(webdriver.By.tagName("body"))
        .getText();
      if (
        /We could not find a forum account with that username/.test(bodyText) ||
        /The username and password fields are required/.test(bodyText) ||
        /We're sorry/.test(bodyText)
      ) {
        cont = true;
        conf.curSet("usrName", "");
        clearScreen();
        console.log(
          "There was a problem logging in, please provide your info again."
        );
      } else {
        cont = false;
      }
    } while (cont);

    if (
      (await browser.findElement(webdriver.By.css("#title")).getText()) ===
      "Select Account"
    ) {
      cont = true;
      do {
        if (!conf.get(currentConfigName + ".usrId")) {
          var question = await inquirer.prompt([
            {
              name: "userId",
              type: "input",
              message: "User ID :"
            }
          ]);
          conf.curSet("usrId", question.userId);
        }
        countdown.newMessage("Selecting user...");
        countdown.start();
        try {
          await browser
            .findElement(
              webdriver.By.xpath('//input[@value="' + conf.get(currentConfigName + ".usrId") + '"]')
            )
            .click();
          cont = false;
        } catch (err) {
          console.log("User not found, please try again");
          conf.curSet("usrId", "");
        }
        countdown.stop();
      } while (cont);
    }
    console.log("Success!");
  } catch (err) {
    console.log(err);
    quit();
  }
}

async function openPluginEditPage() {
  try {
    var cont;
    do {
      try {
        cont = false;
        if (!conf.get(currentConfigName + ".pluginName")) {
          var question = await inquirer.prompt([
            {
              name: "pluginName",
              type: "input",
              message: "Plugin Name :"
            }
          ]);
          countdown.newMessage("Opening plugin edit page...");
          conf.curSet("pluginName", question.pluginName);
        }
        countdown.start();
        await browser
          .findElement(webdriver.By.linkText(conf.get(currentConfigName + ".pluginName")))
          .click();
      } catch (err) {
        console.log("Plugin does not appear to exist, please try again!");
        conf.curSet("pluginName", "");
        countdown.stop();
        cont = true;
      }
    } while (cont);
    await browser
      .findElement(webdriver.By.css("a[href='#components-container']"))
      .click();
    countdown.stop();
  } catch (err) {
    console.log(err);
    quit();
  }
}

async function exit() {
  clearScreen();
  console.log('Quitting...');
  await quit();
  chromedriver.stop();
  process.exit();
}

async function menu() {
  while (true) {
    clearScreen();
    var question = await inquirer.prompt([
      {
        name: "option",
        type: "list",
        choices: [
          "Update from Clipboard",
          "Run Build",
          "Change and Run Build Command",
          "Exit"
        ]
      }
    ]);
    switch (question.option) {
      case "Update from Clipboard":
        await pasteText();
        break;
      case "Run Build":
        await runBuildScript();
        break;
      case "Change and Run Build Command":
        await runBuildScript(true);
        break;
      case "Exit":
        await exit();
        return;
      default:
        console.log("Invalid option");
    }
  }
}

async function pasteText() {
  countdown.newMessage("Saving from clipboard...");
  await typeText();
  countdown.start();
  countdown.stop();
}

async function typeText(text) {
  if (text) {
    clipboard(text);
  }
  await browser.findElement(webdriver.By.css(".CodeMirror-scroll")).click();
  // Highlight everything
  await browser
    .switchTo()
    .activeElement()
    .sendKeys(webdriver.Key.chord(webdriver.Key.COMMAND, "a"));
  // Using shift+insert to paste
  await browser
    .switchTo()
    .activeElement()
    .sendKeys(webdriver.Key.chord(webdriver.Key.SHIFT, webdriver.Key.INSERT));
  // Trigger save
  await browser.findElement(webdriver.By.css(".save-components")).click();
}

async function clearScreen() {
  clear();
  console.log(chalk.green(figlet.textSync("PbPup")));
}

async function runBuildScript(clear) {
  var buildCommand = conf.get(currentConfigName + ".buildCommand");
  if (clear) conf.curSet("buildCommand", "");
  if (!conf.get(currentConfigName + ".buildCommand")) {
    await getBuildCommand(buildCommand);
  } 
  clearScreen();
  countdown.newMessage("Building...");
  countdown.start();
  try {
    var text = cp.execSync(conf.get(currentConfigName + ".buildCommand")).toString();
  } catch (err) {
    console.log(err);
    countdown.stop();
    return;
  }
  console.log(text);
  await typeText(text);
  countdown.stop();
}

async function getBuildCommand(curCommand) {
  clearScreen();
  if (curCommand) console.log("Current command: " + curCommand);
  var question = await inquirer.prompt([
    {
      name: "buildCommand",
      type: "input",
      message: "Enter a shell command (leave blank to keep current):",
      filter: value => {
        if (!value && curCommand)
          return curCommand;
        else (!value)
          return value;
      }
    }
  ]);
  conf.curSet("buildCommand", question.buildCommand);
}

async function getForumUrl() {
  clearScreen();
  if (!conf.get(currentConfigName + ".forum")) {
    var question = await inquirer.prompt([
      {
        name: "configName",
        type: "input",
        message: "Name for configuration"
      },
      {
        name: "forum",
        type: "input",
        message: "Url of the forum (exlude https://) :"
      }
    ]);
    currentConfigName = question.configName;
    conf.curSet("forum", "https://" + question.forum);
    conf.curSet("configName", currentConfigName);
  }
}

async function selectDeleteConfig() {
  clearScreen();
  var all = conf.all;
  var question = await inquirer.prompt([
    {
      name: "config",
      type: "list",
      choices: Object.keys(all).concat(["Cancel"]),
      message: "Choose a configuration to delete"
    }
  ])

  switch(question.config) {
    case "Cancel":
      await selectConfig();
      break;
    default: 
      conf.delete(question.config);
      await selectConfig();
      break;
  }
}

async function selectConfig() {
  var all = conf.all;
  if (Object.keys(all).length > 0) {
    var question = await inquirer.prompt([
      {
        name: "config",
        type: "list",
        choices: Object.keys(all).concat(["New", "Delete", "Exit"]),
        message: "Select a configuration"
      }
    ]);

    switch(question.config) {
      case "Exit":
        await exit();
        break;
      // Set the config name to blank to trigger new configuration
      case "New":
        question.config = "";
        break;
      case "Delete":
        await selectDeleteConfig();
        return;
    }

    currentConfigName = question.config;
  }
}

async function main() {
  clearScreen();
  await selectConfig();
  await getForumUrl();
  countdown.newMessage("Going to login page...");
  countdown.start();
  await browser.get(conf.get(currentConfigName + ".forum"));
  await goToLogin();
  countdown.stop();
  clearScreen();
  await logIn();
  clearScreen();
  countdown.newMessage("Going to plugin build list...");
  countdown.start();
  await browser.get(
    conf.get(currentConfigName + ".forum") + "/admin/plugins/manage#build-container-tab"
  );
  countdown.stop();
  await openPluginEditPage();
  menu();
}
setTimeout(() => main(), 1000);
