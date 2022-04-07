"use strict";

const fs = require('fs');
const args = process.argv.slice(2);
const logDir = "./performance_instrumentation";
const outputDir = "./output_performance_instrumentation";

if (!fs.existsSync(logDir)){
  fs.mkdirSync(logDir);
}

if (!fs.existsSync(outputDir)){
  fs.mkdirSync(outputDir);
}

if (!(args.length == 4)) {
  console.log("USAGE: node index.js {username} {access key} {session id} raw");
  process.exit(1);
}
let filename = `${logDir}/${args[2]}_raw_log.log`;
let outputJson = `${outputDir}/${args[2]}_raw_log.json`;
require("child_process").execSync(`curl -u ${args[0]}:${args[1]} https://api.browserstack.com/automate/sessions/${args[2]}/logs > ${filename}`);

const Reader = require("./reader");
let reader = new Reader(filename, args[3]);
reader.read(output => {
  fs.writeFile(outputJson, output, function(err) {
    if (err) {
      console.log('Error: ' + err);
    }
    console.log(output + ` was written to file ${outputJson}`);
  });
});
