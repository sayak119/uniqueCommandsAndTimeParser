"use strict";
const fs = require("fs");
const versions = require("./versions");

const DATE_RE = /\d{2}:\d{2}:\d{2}\.\d{3}/g;
const RAW_DATE_RE = /\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}:\d{1,2}:\d{1,3} /g;
const CHUNK_SIZE = 1000;

module.exports = class Reader {
  constructor(path, version) {
    this.path = path;
    this.version = version;
    this.commandStartIdentifier = versions[version].commandStartIdentifier;
    this.responseIdentifier = versions[version].responseIdentifier;
  }

  static extractDateIndexes(chunk, isRaw) {
    let occurences = [];
    let remainingString = chunk;

    while (remainingString) {
      let occurence = remainingString.search(isRaw ? RAW_DATE_RE : DATE_RE);
      if (occurence == -1) return occurences;
      let lastOccurence =
        occurences.length > 0 ? occurences[occurences.length - 1] + 12 : 0;
      occurences.push(occurence + lastOccurence);
      remainingString = remainingString.slice(occurence + 12);
    }

    return [];
  }

  static extractCommandsFromPendingChunk(pendingChunk, startId, endId) {
    let chunkString = pendingChunk.toString();
    let dateOccurences = Reader.extractDateIndexes(chunkString, false);
    let dates = [];
    for (let i = 0; i < dateOccurences.length; i++) {
      dates.push(chunkString.slice(dateOccurences[i], dateOccurences[i] + 12));
    }

    let currentDateIndex = -1;

    return chunkString
      .split(DATE_RE)
      .slice(1)
      .map(command => {
        currentDateIndex++;
        let start = command.indexOf(" - ") + 3 ? command.indexOf(" - ") + 3 : 0;
        let end = command.indexOf("(") ? command.indexOf("(") : command.length;
        return {
          command: command.slice(start, end),
          date: dates[currentDateIndex]
        };
      })
      .filter(
        command =>
          command.command.includes(startId) || command.command.includes(endId)
      );
  }

  static cleanRawDate(date) {
    return date.split(" ")[0] + " " + date.split(" ")[1];
  }

  static extractCommandsFromPendingRawChunk(pendingChunk, startId, endId) {
    let chunkString = pendingChunk.toString();
    let dateOccurences = Reader.extractDateIndexes(chunkString, true);
    let dates = [];
    for (let i = 0; i < dateOccurences.length; i++) {
      dates.push(
        Reader.cleanRawDate(
          chunkString.slice(dateOccurences[i], dateOccurences[i] + 21)
        )
      );
    }

    let currentDateIndex = -1;

    return chunkString
      .split(RAW_DATE_RE)
      .slice(1)
      .map(command => {
        currentDateIndex++;
        return {
          command: command.trim(),
          date: dates[currentDateIndex]
        };
      })
      .filter(
        command =>
          command.command.includes(startId) ||
          command.command.includes(endId) ||
          command.command.includes("START_SESSION")
      );
  }

  static TwoPairsEqual(pair, other) {
    if (pair && pair.start.command.includes("REQUEST ["))
      pair.start.command = pair.start.command.slice(
        pair.start.command.indexOf("]") + 1
      );
    if (other && other.start.command.includes("REQUEST ["))
      other.start.command = other.start.command.slice(
        other.start.command.indexOf("]") + 1
      );

    return (
      pair &&
      other &&
      pair.start &&
      pair.end &&
      other.start &&
      other.end &&
      pair.start.command == other.start.command &&
      pair.end.command == other.end.command
    );
  }

  static getUniqueCommands(pairs) {
    let currentPairIndex = 0;
    let uniqueCommands = [];

    while (currentPairIndex < pairs.length) {
      if (currentPairIndex < pairs.length - 1) {
        if (
          !Reader.TwoPairsEqual(
            pairs[currentPairIndex],
            pairs[currentPairIndex + 1]
          )
        ) {
          if (
            Reader.TwoPairsEqual(
              pairs[currentPairIndex],
              pairs[currentPairIndex - 1]
            )
          ) {
            uniqueCommands[uniqueCommands.length - 1].end =
              pairs[currentPairIndex].end;
          } else {
            uniqueCommands.push(pairs[currentPairIndex]);
          }
        } else {
          if (
            !Reader.TwoPairsEqual(
              pairs[currentPairIndex],
              pairs[currentPairIndex - 1]
            )
          ) {
            uniqueCommands.push({
              start: pairs[currentPairIndex].start
            });
          }
        }
      } else {
        if (
          !Reader.TwoPairsEqual(
            pairs[currentPairIndex],
            pairs[currentPairIndex - 1]
          )
        ) {
          uniqueCommands.push(pairs[currentPairIndex]);
        }
      }

      currentPairIndex++;
    }

    return uniqueCommands;
  }

  static parseRawDate(date) {
    let total = 0;

    let parts = date.split(" ");
    let dateParts = parts[0].split("-").map(p => parseInt(p));
    let timeParts = parts[1].split(":").map(p => parseInt(p));

    total +=
      dateParts[0] * 31556926279.7 +
      dateParts[1] * 2629743833.3334 +
      dateParts[2] * 86400000 +
      timeParts[0] * 3600000 +
      timeParts[1] * 60000 +
      timeParts[2] * 1000 +
      timeParts[3];

    return total;
  }

  static parseDate(date, isRaw) {
    if (isRaw) return Reader.parseRawDate(date);

    let parts = date.split(":").map(part => parseFloat(part));
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  static calculateCommandDuration(command, isRaw) {
    if (!command.end) return 0;

    let startDate = this.parseDate(command.start.date, isRaw);
    let endDate = this.parseDate(command.end.date, isRaw);

    return parseFloat((endDate - startDate).toFixed(3));
  }

  static calculateInsideTime(uniqueCommands, isRaw) {
    let insideTime = 0;
    uniqueCommands.forEach(
      command => (insideTime += this.calculateCommandDuration(command, isRaw))
    );
    return insideTime.toFixed(3);
  }

  static calculateOutsideTime(pairs, insideTime, isRaw) {
    return (
      this.calculateCommandDuration(
        {
          start: pairs[0].start,
          end: pairs[pairs.length - 1].end
            ? pairs[pairs.length - 1].end
            : pairs[pairs.length - 1].start
        },
        isRaw
      ) - insideTime
    ).toFixed(3);
  }

  static findIndexOfStartSession(pairs) {
    let startCommand = pairs.find(
      p =>
        (p.start && p.start.command.includes("START_SESSION")) ||
        (p.end && p.end.command.includes("START_SESSION"))
    );
    return pairs.includes(startCommand)
      ? pairs.indexOf(startCommand)
      : pairs.length + 1;
  }

  read(callback) {
    let occurences = [];
    let pairs = [];
    let pendingChunk = "";

    let startId = this.commandStartIdentifier;
    let endId = this.responseIdentifier;
    let isRaw = this.version === "raw";

    const processPendingChunk = () => {
      let commands =
        this.version === "raw"
          ? Reader.extractCommandsFromPendingRawChunk(
              pendingChunk,
              startId,
              endId
            )
          : Reader.extractCommandsFromPendingChunk(
              pendingChunk,
              startId,
              endId
            );
      if (commands.length) {
        commands.forEach(command => {
          if (command.command.includes(startId))
            pairs.push({
              start: command
            });
          else if (pairs.length && !pairs[pairs.length - 1].end)
            (pairs[pairs.length - 1].end = command), command;
        });
      }
      pendingChunk = "";
    };

    const stream = fs.createReadStream(this.path, {
      highWaterMark: CHUNK_SIZE
    });

    stream.on("data", function(chunk) {
      let chunkString = chunk.toString();
      occurences = Reader.extractDateIndexes(chunkString, isRaw);

      if (occurences.length == 0) {
        pendingChunk += chunkString;
        return;
      } else {
        pendingChunk += chunkString.slice(0, occurences[occurences.length - 1]);
        processPendingChunk();
        pendingChunk += chunkString.slice(occurences[occurences.length - 1]);
      }
    });

    stream.on("close", () => {
      processPendingChunk();
      if (isRaw) pairs = pairs.slice(Reader.findIndexOfStartSession(pairs) + 1);
      let uniquePairs = Reader.getUniqueCommands(pairs);
      let insideTime = Reader.calculateInsideTime(uniquePairs, isRaw);
      let perRequestInsideTime = (insideTime / uniquePairs.length).toFixed(3);
      let outsideTime = Reader.calculateOutsideTime(pairs, insideTime, isRaw);
      let perRequestOutsideTime = (outsideTime / uniquePairs.length).toFixed(3);

      callback(JSON.stringify({
        numberOfUniqueCommands: uniquePairs.length,
        insideTime: insideTime,
        perRequestInsideTime: perRequestInsideTime,
        outsideTime: outsideTime,
        perRequestOutsideTime: perRequestOutsideTime
      }));
    });
  }
};
