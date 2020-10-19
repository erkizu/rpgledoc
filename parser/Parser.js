"use strict";

const fs = require('fs');
const path = require('path');

function isspace(c)
{
	return (c === '\t' || c === ' ');
}

function isblank(c)
{
	return isspace(c) || c === void 0;
}

function Parser(infile)
{
	this.file = infile;
	this.filename = path.basename(infile);
	this.tags = [];
	this.lines = [];

	this.readFile();
	this.parse();
}

Parser.prototype.toJSON = function()
{
	return {
		file: this.file,
		filename: this.filename,
		tags: this.tags,
		lines: this.lines
	};
}

Parser.prototype.readFile = function()
{
	this.lines = fs.readFileSync(this.file).toString().split(/\r?\n/);
}

Parser.prototype.parse = function()
{
	let doc;

	let testDocName = 0;

	const scope = {
		proc: '',
		ds: '',
		pi: '',
		pr: ''
	};

	/*
	 * A documentation follows the following pattern:
	 * DOC_SDESC \n ( DOC_LDESC \n )* ( DOC_TAG* \n )+
	 * Everyting but DOC_OUT, DOC_NAME, DOC_SDESC, and DOC_LDESC is
	 * considered DOC_TAG
	 */
	const DOC_OUT		= 0;	/* Searching for documentation */
	const DOC_NAME		= 1;	/* Searching for a reference name */
	const DOC_SDESC		= 2;	/* Short description (First line of documentation) */
	const DOC_LDESC		= 3;	/* Long description (Continues lines of documentation) */
	const DOC_SEE		= 4;	/* @see    $REF */
	const DOC_SEEC		= 5;	/* @see    $REF */
	const DOC_PARAM		= 6;	/* @param  $ARG $DESC */
	const DOC_PARAMC	= 7;	/* ...$DESC */
	const DOC_RETURN	= 8;	/* @return $DESC */
	const DOC_EXAMPLE	= 9;	/* @example $TITLE */
	const DOC_EXAMPLEC	= 10;	/* $CODE */
	const DOC_DEPRECATED	= 11;	/* @deprecated $DESC */
	const DOC_TODO		= 12;	/* @todo $DESC */
	const DOC_AUTHOR	= 13;	/* @author $DESC */

	const DOC_IN		= 9999;	/* Inside a documentation, buth without a purpose */

	let state = DOC_OUT;

	this.lines.forEach((orig_line, lineno) => {
		lineno++;
		if (orig_line.length == 0)
			return;		/* Skip empty lines */

		let line = orig_line;

		if (testDocName == 1) {
			testDocName = 0
			if (!/\/{2}/g.test(line)) {
				state = DOC_NAME;
			}
		}

		if (state == DOC_NAME) {
			let m;
			if ((m = line.match(/\s*dcl-(proc|ds|s|c|pr)\s+(\w+)/))) {
				doc.type = m[1];
				doc.refname = m[2];
			} else {
				doc.type = '';
				doc.name = '';
			}

			doc.exported = /\bexport\b/.test(line);

			state = DOC_OUT;
			/* Fall through */
		}
		if (state == DOC_OUT) {
			if (!scope.pi) {
				const r = /\s*dcl-pi\b/;
				if (r.test(line) && !/\bend-pi\b/.test(line)) {
					let m;
					if ((m = line.match(/\s*dcl-pi/i)))
						scope.pi = m[1];
					else
						scope.pi = '-';
					if (doc && doc.refname == scope.proc)
						doc.tag_return.type = scope.pi;
				}
			} else {
				if (/\s*end-pi\b/i.test(line)) {
					scope.pi = '';
				} else if (doc && doc.refname == scope.proc) {
					/* Update current doc with proper types for the params */
					let m;
					if ((m = line.match(/\s*(\w+)\s+(.*?);/))) {
						doc.tag_params.some((param) => {
							if (param.arg == m[1]) {
								param.type = m[2];
								param.line = lineno;
								return true;
							}
						});
					}
				}
			}

			if (!scope.ds) {
				let m;
				if ((m = line.match(/\s*dcl-ds\s+(\w+)/i))
				    && !/\bend-ds\b|\blikeds\b/.test(line))
					scope.ds = m[1];
			} else {
				if (/\s*end-ds\b/i.test(line)) {
					scope.ds = '';
				} else if (doc && doc.refname == scope.ds) {
					/* Update current doc with proper types for the params */
					let m;
					if ((m = line.match(/\s*(\w+)\s+(.*?);/))) {
						doc.tag_params.some((param) => {
							if (param.arg == m[1]) {
								param.type = m[2];
								param.line = lineno;
								return true;
							}
						});
					}
				}
			}

			if (!scope.pr) {
				let m;
				if ((m = line.match(/\s*dcl-pr\s+(\w+)/i))
				    && !/\bend-pr\b|\blikeds\b/.test(line))
					scope.pr = m[1];
			} else {
				if (/\s*end-pr\b/i.test(line)) {
					scope.pr = '';
				} else if (doc && doc.refname == scope.pr) {
					/* Update current doc with proper types for the params */
					let m;
					if ((m = line.match(/\s*(\w+)\s+(.*?);/))) {
						doc.tag_params.some((param) => {
							if (param.arg == m[1]) {
								param.type = m[2];
								param.line = lineno;
								return true;
							}
						});
					}
				}
			}

			if (!scope.proc) {
				let m;
				if ((m = line.match(/\s*dcl-proc\s+(\S+(?=\s+export|\s*;))/i)))
					scope.proc = m[1];
			} else {
				if (/\s*end-proc\b/i.test(line))
					scope.proc = '';
			}

			if (/\/{2}\*{10,}/.test(line)) {
				state = DOC_SDESC;

				doc = {
					line: lineno,
					scope: Object.assign({}, scope),
					exported: false,
					type: '',		/* proc, ds, s, c, or '' */
					refname: this.filename,	/* procedure, structure, ... name */
					short_desc: '',		/* one time description */
					long_desc: '',		/* ...continuesly lines */
					tag_see: [],		/* @see    $REFNAME */
					tag_params: [],		/* @param  $ARG $DESC */
					tag_return: {		/* @return $DESC */
						type: '-',
						desc: ''
					},
					tag_example: [],	/* @example $TITLE NL $CODE */
					tag_deprecated: {	/* @deprecated $DESC */
						deprecated: false,
						desc: ''
					},
					tag_todo: '',		/* @todo $DESC */
					tag_author: []		/* @author $DESC */
				};
				this.tags.push(doc);
			}
			return;		/* Next line */
		}

		if (/\/{2}\*{10,}/.test(line)) {
			//state = DOC_NAME;
			testDocName = 1; /* Can't decide wether DOC_NAME is next state. We'll have to check next line */ 
			return;		/* Next line */
		}

		/* Remove comment leader */
		line = line.replace(/^\s*\*/g, '');

		/* Keep a line with original indent as it's used for examples */
		const indented_line = line;
		line = indented_line.trim();

		if (line[0] == '@') {
			if (line.startsWith('@see') && isblank(line[4])) {
				state = DOC_SEE;
				line = line.slice(4);
			} else if (line.startsWith('@param') && isblank(line[6])) {
				state = DOC_PARAM;
				line = line.slice(6);
			} else if (line.startsWith('@return') && isblank(line[7])) {
				state = DOC_RETURN;
				line = line.slice(7);
			} else if (line.startsWith('@example') && isblank(line[8])) {
				state = DOC_EXAMPLE;
				line = line.slice(8);
			} else if (line.startsWith('@deprecated') && isblank(line[11])) {
				state = DOC_DEPRECATED;
				line = line.slice(11);
			} else if (line.startsWith('@todo') && isblank(line[5])) {
				state = DOC_TODO;
				line = line.slice(5);
			} else if (line.startsWith('@author') && isblank(line[7])) {
				state = DOC_AUTHOR;
				line = line.slice(7);
			} else {
				console.error('%s: unknown tag \'%s\'',
					      this.file, line.split(/\s+/).shift());
				state = DOC_IN;
				return;		/* Next line */
			}
		}

		line = line.trim();

		switch (state) {
		case DOC_SDESC:
			doc.short_desc = line;
			state = DOC_LDESC;
			break;
		case DOC_LDESC:
			if (!doc.long_desc)
				doc.long_desc = line;
			else
				doc.long_desc += ' ' + line;
			break;
		case DOC_SEE:
			doc.tag_see.push(line);
			state = DOC_SEEC;
			break;
		case DOC_SEEC:
			doc.tag_see[doc.tag_see.length - 1] += ' ' + line;
			break;
		case DOC_PARAM:
			/*
			 * Read of first word as "arg",
			 * store the rest in "desc"
			 */
			let i;
			let arg = '';
			for (i = 0; i < line.length; i++) {
				if (isspace(line[i]))
					break;
				arg += line[i];
			}
			doc.tag_params.push({
				arg: arg,
				type: '-',
				line: lineno,
				desc: line.slice(i).trim()
			});
			state = DOC_PARAMC;
			break;
		case DOC_PARAMC:
			doc.tag_params[doc.tag_params.length - 1].desc += ' ' + line;
			break;
		case DOC_RETURN:
			if (!doc.tag_return.desc)
				doc.tag_return.desc = line;
			else
				doc.tag_return.desc += ' ' + line;
			break;
		case DOC_EXAMPLE:
			doc.tag_example.push({
				title: line,
				lines: []
			});
			state = DOC_EXAMPLEC;
			break;
		case DOC_EXAMPLEC:
			const ex_lines = doc.tag_example[doc.tag_example.length - 1].lines;
			ex_lines.push(indented_line);
			break;
		case DOC_DEPRECATED:
			doc.tag_deprecated.deprecated = true;
			if (!doc.tag_deprecated.desc)
				doc.tag_deprecated.desc = line;
			else
				doc.tag_deprecated.desc += ' ' + line;
			break;
		case DOC_TODO:
			if (!doc.tag_todo)
				doc.tag_todo = line;
			else
				doc.tag_todo += ' ' + line;
			break;
		case DOC_AUTHOR:
			doc.tag_author.push(line);
			state = DOC_IN;
			break;
		}
	});
}

module.exports = Parser;
