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
var clipboard = require("clipboardy");
var configstore = require("configstore");
var chromedriver = require("chromedriver");

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
conf.curGet = (key) => conf.get(currentConfigName + "." + key);

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

// Catch a ctrl-c and clean up
process.on("SIGINT", function() {
  quit();
});

/*
 * @function: async goToLogin
 * @description: Goes to the login page of the current
 *  forum by clicking on the login link from the main
 *  page
 * @params: none
 * @returns: none
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
 * @function: async checkCaptcha
 * @description: Detects captcha presence on login page
 *  and prompts user to pass captcha manually if it
 *  is present
 * @params: none
 * @returns: none
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
  }
  return cont;
}

/*
 * @function: logIn
 * @description: Prompts the user for login credentials
 *  and logs them in
 * @params: none
 * @returns: none
 */
async function logIn() {
  try {
    var cont;

    do {
      cont = false;
      // Request username if current config doesn't have one
      if (!conf.curGet("usrName")) {
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
      // Always request password
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
          conf.curGet("usrName") +
          "')"
      );
      // Input password
      await browser
        .findElement(webdriver.By.name("password"))
        .sendKeys(password.password);
      // Clear password so we're not holding it in memory
      password.password = "";
      clearScreen();
      countdown.newMessage("Attempting to log in...");
      countdown.start();
      // Click login button
      await browser.findElement(webdriver.By.name("continue")).click();
      countdown.stop();

      // Check if captcha appeared
      cont = await checkCaptcha();

      // Get all the text from the page
      var bodyText = await browser
        .findElement(webdriver.By.tagName("body"))
        .getText();
      // Validate login was successfull
      if (
        /We could not find a forum account with that username/.test(bodyText) ||
        /The username and password fields are required/.test(bodyText) ||
        /We're sorry/.test(bodyText)
      ) {
        // If login was unsuccessful, notify user and try again
        cont = true;
        conf.curSet("usrName", "");
        clearScreen();
        console.log(
          "There was a problem logging in, please provide your info again."
        );
      } else {
        // If login was successfull, stop
        cont = false;
      }
    } while (cont);

    // Check if the select account page is displaying
    if (
      (await browser.findElement(webdriver.By.css("#title")).getText()) ===
      "Select Account"
    ) {
      cont = true;
      do {
        if (!conf.curGet("usrId")) {
          // Get a user id if one is not already stored
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
        // Select the user using the user id
        try {
          await browser
            .findElement(
              webdriver.By.xpath(
                '//input[@value="' +
                  conf.curGet("usrId") +
                  '"]'
              )
            )
            .click();
          cont = false;
        } catch (err) {
          // If there was an error, the user probably doesn't exist
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

/*
 * @function openPluginEditPage
 * @description Opens the plugin edit page once the user is logged in
 * @params: none
 * @returns: none
 */
async function openPluginEditPage() {
  try {
    var cont;
    do {
      try {
        cont = false;
        if (!conf.curGet("pluginName")) {
          // Get the name of the plugin we want to edit if we don't already have one
          var question = await inquirer.prompt([
            {
              name: "pluginName",
              type: "input",
              message: "Plugin Name :"
            }
          ]);
          conf.curSet("pluginName", question.pluginName);
        }
        countdown.newMessage("Opening plugin edit page...");
        countdown.start();
        // Open the plugin page by clicking on the link with the plugin name
        await browser
          .findElement(
            webdriver.By.linkText(conf.curGet("pluginName"))
          )
          .click();
      } catch (err) {
        // If we have a problem the plugin likely doesn't exist
        console.log("Plugin does not appear to exist, please try again!");
        conf.curSet("pluginName", "");
        countdown.stop();
        cont = true;
      }
    } while (cont);
    // Focus on the first container
    await browser
      .findElement(webdriver.By.css("a[href='#components-container']"))
      .click();
    countdown.stop();
  } catch (err) {
    console.log(err);
    quit();
  }
}

/*
 * @function: quit
 * @description: Clean up when exiting
 * @params: none
 * @returns: none
 */
async function quit() {
  clearScreen();
  console.log("Quitting...");
  try {
    await browser.quit();
    await chromedriver.stop();
    clearScreen(true);
    process.exit();
  } catch(e) {
    // There were errors closing
    // Most likely already closed
    // Just quit the process
    clearScreen(true);
    process.exit();
  }
}

/*
 * @function: menu
 * @description: Displays a text menu
 * @params: none
 * @returns: none
 */
async function menu() {
  while (true) {
    clearScreen();
    // Display the menu and request input
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
    // Handle input from user
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
        await quit();
        return;
      default:
        console.log("Invalid option");
    }
  }
}

/*
 * @function: pasteText
 * @description: Wrapper function to tell
 *  typeText to use clipboard instead of
 *  input text
 * @params: none
 * @returns: none
 */
async function pasteText() {
  countdown.newMessage("Saving from clipboard...");
  await typeText();
  countdown.start();
  countdown.stop();
}

/*
 * @function: typeText
 * @description: Function to type text into
 *  the code box. Utilizes clipboard and 
 * @params: text {string} the text to be pasted
 *  into the code box. If not supplied, this function
 *  will paste whatever is in the the clipboard
 * @returns: none
 */
async function typeText(text) {
  countdown.newMessage('Saving...');
  countdown.start();
  var oldClip;
  if (text) {
    // Save contents of clipboard
    oldClip = await clipboard.readSync();
    await clipboard.writeSync(text);
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
  if (text) {
    // Restore clipbaord
    await clipboard.writeSync(oldClip);
  }
  countdown.stop();
}

/* 
 * @function: celarScreen
 * @description: Clears the screen and draws logo
 * @params:  noLogo {bool} If true, the logo will not be drawn
 * @returns: none
 */
async function clearScreen(noLogo) {
  clear();
  if (!noLogo)
    console.log(chalk.green(figlet.textSync("PbPup")));
}

/*
 * @function: runBuildScript
 * @description: Runs a script. The script should echo
 *  the compiled code otherwise nothing will be pasted
 *  into the code box
 * @params: clear {bool} If true, the function will clear
 *  the current build command and prompt for a new one
 * @returns: none
 */
async function runBuildScript(clear) {
  var buildCommand = conf.curGet("buildCommand");
  // Query new build command if needed
  if (!conf.curGet("buildCommand") || clear) {
    await getBuildCommand();
  }
  clearScreen();
  countdown.newMessage("Building...");
  countdown.start();
  try {
    // Execute build command, save output into variable
    var text = cp
      .execSync(conf.curGet("buildCommand"))
      .toString(); // execSync returns a buffer, needs to be converted to a string
  } catch (err) {
    console.log(err);
    countdown.stop();
    return;
  }
  countdown.stop();
  // Type text into code box
  await typeText(text);
}

/*
 * @function: getBuildCommand
 * @description: Queries a build command from the user
 * @params: none
 * @returns: none
 */
async function getBuildCommand() {
  clearScreen();
  var curCommand = conf.curGet("buildCommand");
  if (curCommand)
    console.log("Current command: " + conf.curGet("buildCommand"));
  var question = await inquirer.prompt([
    {
      name: "buildCommand",
      type: "input",
      message: "Enter a shell command (leave blank to keep current):",
      filter: value => {
        if (!value && curCommand) return curCommand;
        else return value;
      }
    }
  ]);
  conf.curSet("buildCommand", question.buildCommand);
}

async function getForumUrl() {
  clearScreen();
  if (!conf.curGet("forum")) {
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
  ]);

  switch (question.config) {
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

    switch (question.config) {
      case "Exit":
        await quit();
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
  await browser.get(conf.curGet("forum"));
  await goToLogin();
  countdown.stop();
  clearScreen();
  await logIn();
  clearScreen();
  countdown.newMessage("Going to plugin build list...");
  countdown.start();
  await browser.get(
    conf.curGet("forum") +
      "/admin/plugins/manage#build-container-tab"
  );
  countdown.stop();
  await openPluginEditPage();
  menu();
}
setTimeout(() => main(), 2000);
