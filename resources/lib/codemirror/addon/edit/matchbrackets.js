// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE

/**
 * Modified by the WMDE Technical Wishes Team
 * currently based on
 * https://github.com/codemirror/CodeMirror/blob/4823ade863d0306371858394bc1b117aed3043bf/addon/edit/matchbrackets.js
 * (from 2021-01-14)
 *
 * Modifications:
 * - Introduced findSurroundingBrackets() along with it's `brackets` map. This is called when no
 *   `match` is found at the current cursor position.
 * - Removed the `style` argument from the `scanForBracket` call. This fixes a compatibility issue
 *   with the "mediawiki" mode that tokenizes some brackets as `[[` or `{{{` pairs or triplets.
 */

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  var ie_lt8 = /MSIE \d/.test(navigator.userAgent) &&
    (document.documentMode == null || document.documentMode < 8);

  var Pos = CodeMirror.Pos;

  var matching = {"(": ")>", ")": "(<", "[": "]>", "]": "[<", "{": "}>", "}": "{<", "<": ">>", ">": "<<"};

  function bracketRegex(config) {
    return config && config.bracketRegex || /[(){}[\]]/
  }

	var surroundingBrackets = {
		'(': ')',
		')': false,
		'[': ']',
		']': false,
		'{': '}',
		'}': false
	};

	function findSurroundingBrackets( cm, where, config ) {
		var from, to, ch,
			nestedBracketsToSkip = 0,
			lineNo = where.line,
			line = cm.getLine( lineNo ),
			pos = where.ch,
			maxScanLen = ( config && config.maxScanLineLength ) || 10000,
			maxScanLines = ( config && config.maxScanLines ) || 1000;

		// Check the limit for the current line
		if ( line.length > maxScanLen ) {
			return null;
		}

		// Search forward
		while ( true ) {
			if ( pos >= line.length ) {
				lineNo++;
				// Give up when to many lines have been scanned
				if ( lineNo > cm.lastLine() || lineNo - where.line >= maxScanLines ) {
					break;
				}
				line = cm.getLine( lineNo );
				// Give up when the next line is to long
				if ( line.length > maxScanLen ) {
					return null;
				}
				pos = 0;
				// Continue early to make sure we don't read characters from empty lines
				continue;
			}

			ch = line.charAt( pos );
			if ( ch in surroundingBrackets ) {
				// Found a closing bracket that's not part of a nested pair
				if ( !surroundingBrackets[ch] && nestedBracketsToSkip <= 0 ) {
					to = { pos: Pos( lineNo, pos ), char: ch };
					break;
				}
				nestedBracketsToSkip += surroundingBrackets[ch] ? 1 : -1;
			}

			pos++;
		}

		nestedBracketsToSkip = 0;
		lineNo = where.line;
		line = cm.getLine( lineNo );
		pos = where.ch;

		// Search backwards
		while ( true ) {
			pos--;
			if ( pos < 0 ) {
				lineNo--;
				// Give up when to many lines have been scanned
				if ( lineNo < cm.firstLine() || where.line - lineNo >= maxScanLines ) {
					break;
				}
				line = cm.getLine( lineNo );
				// Give up when the next line is to long
				if ( line.length > maxScanLen ) {
					return null;
				}
				pos = line.length;
				// Continue early to make sure we don't read characters from empty lines
				continue;
			}

			ch = line.charAt( pos );
			if ( ch in surroundingBrackets ) {
				// Found an opening bracket that's not part of a nested pair
				if ( surroundingBrackets[ch] && nestedBracketsToSkip <= 0 ) {
					from = { pos: Pos( lineNo, pos ), expectedToChar: surroundingBrackets[ch] };
					break;
				}
				nestedBracketsToSkip += surroundingBrackets[ch] ? -1 : 1;
			}
		}

		if ( from && to ) {
			return {
				from: from.pos,
				to: to.pos,
				match: from.expectedToChar === to.char
			};
		} else if ( from || to ) {
			return { from: ( from || to ).pos, match: false };
		}

		return null;
	}

  function findMatchingBracket(cm, where, config) {
    var line = cm.getLineHandle(where.line), pos = where.ch - 1;
    var afterCursor = config && config.afterCursor
    if (afterCursor == null)
      afterCursor = /(^| )cm-fat-cursor($| )/.test(cm.getWrapperElement().className)
    var re = bracketRegex(config)

    // A cursor is defined as between two characters, but in in vim command mode
    // (i.e. not insert mode), the cursor is visually represented as a
    // highlighted box on top of the 2nd character. Otherwise, we allow matches
    // from before or after the cursor.
    var match = (!afterCursor && pos >= 0 && re.test(line.text.charAt(pos)) && matching[line.text.charAt(pos)]) ||
        re.test(line.text.charAt(pos + 1)) && matching[line.text.charAt(++pos)];
    // Note: Modified by WMDE, was `return null` before.
    if (!match) return findSurroundingBrackets( cm, where, config );
    var dir = match.charAt(1) == ">" ? 1 : -1;
    if (config && config.strict && (dir > 0) != (pos == where.ch)) return null;
    // Note: Disabled for performance reasons.
    // var style = cm.getTokenTypeAt(Pos(where.line, pos + 1));

    // Note: Modified by WMDE, used `style || null` instead of `undefined` before.
    var found = scanForBracket(cm, Pos(where.line, pos + (dir > 0 ? 1 : 0)), dir, undefined, config);
    if (found == null) return null;
    return {from: Pos(where.line, pos), to: found && found.pos,
            match: found && found.ch == match.charAt(0), forward: dir > 0};
  }

  // bracketRegex is used to specify which type of bracket to scan
  // should be a regexp, e.g. /[[\]]/
  //
  // Note: If "where" is on an open bracket, then this bracket is ignored.
  //
  // Returns false when no bracket was found, null when it reached
  // maxScanLines and gave up
  function scanForBracket(cm, where, dir, style, config) {
    var maxScanLen = (config && config.maxScanLineLength) || 10000;
    var maxScanLines = (config && config.maxScanLines) || 1000;

    var stack = [];
    var re = bracketRegex(config)
    var lineEnd = dir > 0 ? Math.min(where.line + maxScanLines, cm.lastLine() + 1)
                          : Math.max(cm.firstLine() - 1, where.line - maxScanLines);
    for (var lineNo = where.line; lineNo != lineEnd; lineNo += dir) {
      var line = cm.getLine(lineNo);
      if (!line) continue;
      var pos = dir > 0 ? 0 : line.length - 1, end = dir > 0 ? line.length : -1;
      if (line.length > maxScanLen) continue;
      if (lineNo == where.line) pos = where.ch - (dir < 0 ? 1 : 0);
      for (; pos != end; pos += dir) {
        var ch = line.charAt(pos);
        if (re.test(ch) && (style === undefined || cm.getTokenTypeAt(Pos(lineNo, pos + 1)) == style)) {
          var match = matching[ch];
          if (match && (match.charAt(1) == ">") == (dir > 0)) stack.push(ch);
          else if (!stack.length) return {pos: Pos(lineNo, pos), ch: ch};
          else stack.pop();
        }
      }
    }
    return lineNo - dir == (dir > 0 ? cm.lastLine() : cm.firstLine()) ? false : null;
  }

  function matchBrackets(cm, autoclear, config) {
    // Disable brace matching in long lines, since it'll cause hugely slow updates
    var maxHighlightLen = cm.state.matchBrackets.maxHighlightLineLength || 1000,
      highlightNonMatching = config && config.highlightNonMatching;
    var marks = [], ranges = cm.listSelections();
    for (var i = 0; i < ranges.length; i++) {
      var match = ranges[i].empty() && findMatchingBracket(cm, ranges[i].head, config);
      if (match && (match.match || highlightNonMatching !== false) && cm.getLine(match.from.line).length <= maxHighlightLen) {
        var style = match.match ? "CodeMirror-matchingbracket" : "CodeMirror-nonmatchingbracket";
        marks.push(cm.markText(match.from, Pos(match.from.line, match.from.ch + 1), {className: style}));
        if (match.to && cm.getLine(match.to.line).length <= maxHighlightLen)
          marks.push(cm.markText(match.to, Pos(match.to.line, match.to.ch + 1), {className: style}));
      }
    }

    if (marks.length) {
      // Kludge to work around the IE bug from issue #1193, where text
      // input stops going to the textarea whenever this fires.
      if (ie_lt8 && cm.state.focused) cm.focus();

      var clear = function() {
        cm.operation(function() {
          for (var i = 0; i < marks.length; i++) marks[i].clear();
        });
      };
      if (autoclear) setTimeout(clear, 800);
      else return clear;
    }
  }

  function doMatchBrackets(cm) {
    cm.operation(function() {
      if (cm.state.matchBrackets.currentlyHighlighted) {
        cm.state.matchBrackets.currentlyHighlighted();
        cm.state.matchBrackets.currentlyHighlighted = null;
      }
      cm.state.matchBrackets.currentlyHighlighted = matchBrackets(cm, false, cm.state.matchBrackets);
    });
  }

  function clearHighlighted(cm) {
    if (cm.state.matchBrackets && cm.state.matchBrackets.currentlyHighlighted) {
      cm.state.matchBrackets.currentlyHighlighted();
      cm.state.matchBrackets.currentlyHighlighted = null;
    }
  }

  CodeMirror.defineOption("matchBrackets", false, function(cm, val, old) {
    if (old && old != CodeMirror.Init) {
      cm.off("cursorActivity", doMatchBrackets);
      cm.off("focus", doMatchBrackets)
      cm.off("blur", clearHighlighted)
      clearHighlighted(cm);
    }
    if (val) {
      cm.state.matchBrackets = typeof val == "object" ? val : {};
      cm.on("cursorActivity", doMatchBrackets);
      cm.on("focus", doMatchBrackets)
      cm.on("blur", clearHighlighted)
    }
  });

  CodeMirror.defineExtension("matchBrackets", function() {matchBrackets(this, true);});
  CodeMirror.defineExtension("findMatchingBracket", function(pos, config, oldConfig){
    // Backwards-compatibility kludge
    if (oldConfig || typeof config == "boolean") {
      if (!oldConfig) {
        config = config ? {strict: true} : null
      } else {
        oldConfig.strict = config
        config = oldConfig
      }
    }
    return findMatchingBracket(this, pos, config)
  });
  CodeMirror.defineExtension("scanForBracket", function(pos, dir, style, config){
    return scanForBracket(this, pos, dir, style, config);
  });
});
