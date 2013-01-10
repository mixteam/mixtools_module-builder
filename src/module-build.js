#!/usr/bin/env node
// -*- js -*-

require('./reset');

var VERSION = '0.1.0',
	path = require('path'),
	util = require('util'),
	fs = require('fs'),
	exec = require('child_process').exec,

	spmbuild = require('spm').getAction('build'),
	esprima = require('esprima'),
	escodegen = require('escodegen'),
	uglify = require('uglify-js'),

	options = {
		base : './',
		skipSpm : false,
		baseModInfo : {
			"root" : "#",
			"dist" : "./dist",
			"with-debug" : "-debug",
			"with-dist" : "-dist"
		},
		log : true
	}

	templates = {
		require : fs.readFileSync(path.join(__dirname, '../assets', 'require.tpl')).toString(),
		module : fs.readFileSync(path.join(__dirname, '../assets', 'module.tpl')).toString(),
		builded : fs.readFileSync(path.join(__dirname, '../assets', 'builded.tpl')).toString()
	},

	esprima_opt = {
		tokens : true
	}
	;

function parseTpl(tpl, datas) {
	var s = tpl
		;

	Object.each(datas, function(value, key) {
		var ss = s.split(new RegExp('\\{\\{' + key + '\\}\\}', 'ig'));
		s = ss[0] + value + ss[1];
	});

	return s;
}


function buildModule() {
	var distDir = path.join(options.base, options.baseModInfo.dist),
		fileExp = new RegExp(options.baseModInfo['with-debug'] + '\\.js$','ig')
		;

	function rewrite(err) {
		var files = fs.readdirSync(distDir).slice();

		Object.each(files, function(file) {
			if (file.match(fileExp)) {
				process.nextTick(function() {
					rewriteSyntax(path.join(distDir, file));	
				});
			}
		});
	}

	if (!options.skipSpm) {
		spmbuild.run(options, rewrite);
	} else {
		rewrite();
	}
}

function rewriteSyntax(jsfile) {
	var jsContent = fs.readFileSync(jsfile, 'utf8').toString(),
		jsTokens = esprima.parse(jsContent, esprima_opt).tokens.slice(),
		i = 0, j = 0, len = jsTokens.length, 
		token, nextToken, type, nextType, value, nextValue,
		moduleTokens, modules = [], modulesRef = {}, builded, compressed,
		defineId, requireId, defineSection
		;

	function extractDefination() {
		if (defineId && moduleTokens) {
			if (!modulesRef[defineId]) {
				modulesRef[defineId] = moduleTokens.join('');
				modules.push(defineId);
			}
		}
	}

	function extractRequire() {
		if (requireId) {
			if ((/^\./).test(requireId)) {
				requireId = path.dirname(defineId) + requireId.replace(/\.\.*/, '');
			}

			return parseTpl(templates.require, {
				id : requireId
			});
		}
	}

	while(i < len) {
		token = jsTokens[i++];
		type = token.type.toLowerCase();
		value = token.value;

		nextToken = jsTokens[i];
		if (nextToken) {
			nextType = nextToken.type.toLowerCase();
			nextValue = nextToken.value;
		}


		if (type === 'identifier' && value === 'define' &&
				nextToken && nextType === 'punctuator' && nextValue === '(') {
			extractDefination();

			i++; // strip nextToken
			j = 0;
			moduleTokens = new Array(len - i);
			moduleTokens[j++] = '(';

			defineId = jsTokens[i++].value;
			defineId = defineId.substring(1, defineId.length - 1)
							.replace(options.baseModInfo.root, '');
			defineSection = true;
			continue;
		}

		if (defineSection) {
			if (type === 'punctuator' && value === ']' &&
					nextToken && nextType === 'punctuator' && nextValue === ',') {
				i++; // strip nextToken
				defineSection = false;
			}
			continue;
		}

		if (type === 'identifier' && value === 'require' && 
				nextToken && nextType === 'punctuator' && nextValue === '(') {
			i++;  // strip nextToken

			requireId = jsTokens[i++].value;
			requireId = requireId.substring(1, requireId.length - 1);
			moduleTokens[j++] = extractRequire();

			i++;  // strip nextToken
			continue;
		}

		if (['keyword', 'punctuator'].indexOf(type) >= 0) {
			moduleTokens[j++] = ' ';
		}
		moduleTokens[j++] = value;
		if (['keyword', 'punctuator'].indexOf(type) >= 0) {
			moduleTokens[j++] = ' ';
		}
	}

	extractDefination();

	Object.each(modules, function(id, i) {
		modules[i] = parseTpl(templates.module, {
			id : id,
			func : modulesRef[id].replace(/[,;]\s*$/g, '')
		});
	});


	jsfile = jsfile.replace(options.baseModInfo['with-debug'], options.baseModInfo['with-dist']);
	builded = parseTpl(templates.builded ,{modules:modules.join('')});
	fs.writeFile(jsfile, builded, 'utf8', function(err) {
		compressed = uglify.minify(jsfile);
		fs.writeFile(jsfile, compressed.code, 'utf8');
	});	
}

function main(args) {
	if (args && args instanceof Array){
		while (args.length > 0) {
			var v = args.shift();

			switch(v) {
				case '--nolog':
					options.log = false;
					break;
				case '--skip-spm':
					options.skipSpm = true;
					break;
				case '-v':
				case '--version':
					util.print('version ' + VERSION+"\n");
					process.exit(0);
					break;
				default:
					options.base = v;
					break;
			}
		}
	} else if (args && typeof args === 'object') {
		for (var k in args) {
			options[k] = args[k];
		}
	}

	buildModule();
}

if (require.main === module) {
	main(process.argv.slice(2));
} else {
	module.exports = main;
}


