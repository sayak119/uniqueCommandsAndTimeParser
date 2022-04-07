#  Unique Commands And Time Parser

* To execute the script, run the following command 

```
node index.js <user name> <access key> <session id> raw
```

* The log will be downloaded in `performance_instrumentation` folder.
* The output JSON will be present in `output_performance_instrumentation` folder.
* The output will also be shown on the terminal.
* Example output -

```
{"numberOfUniqueCommands":6,"insideTime":"4938.000","perRequestInsideTime":"823.000","outsideTime":"3142.000","perRequestOutsideTime":"523.667"}
```