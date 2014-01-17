/*
 * grunt-uglify-parallel
 * https://github.com/magicsky/grunt-uglify-parallel
 *
 * Copyright (c) 2014 magicsky
 * Licensed under the MIT license.
 */

module.exports = function (grunt) {
    'use strict';

    var path = require('path');
    var cluster = require("cluster");
    var contrib = require('grunt-lib-contrib').init(grunt);
    var uglify = require('./lib/uglify').init(grunt);
    var async = require("async");
    var _ = require("underscore");

    var chalk = require('chalk');

    // Please see the Grunt documentation for more information regarding task
    // creation: http://gruntjs.com/creating-tasks

    function minify(files, options) {
        // Process banner.
        var banner = grunt.template.process(options.banner);
        var footer = grunt.template.process(options.footer);
        var mapNameGenerator, mapInNameGenerator, mappingURLGenerator;
        files.forEach(function (f) {
            var src = f.src.filter(function (filepath) {
                // Warn on and remove invalid source files (if nonull was set).
                if (!grunt.file.exists(filepath)) {
                    grunt.log.warn('Source file "' + filepath + '" not found.');
                    return false;
                } else {
                    return true;
                }
            });

            if (src.length === 0) {
                grunt.log.warn('Destination (' + f.dest + ') not written because src files were empty.');
                return;
            }

            // function to get the name of the sourceMap
            if (typeof options.sourceMap === "function") {
                mapNameGenerator = options.sourceMap;
            }

            // function to get the name of the sourceMap
            if (typeof options.sourceMapIn === "function") {
                if (src.length !== 1) {
                    grunt.fail.warn('Cannot generate `sourceMapIn` for multiple source files.');
                }
                mapInNameGenerator = options.sourceMapIn;
            }

            // function to get the sourceMappingURL
            if (typeof options.sourceMappingURL === "function") {
                mappingURLGenerator = options.sourceMappingURL;
            }

            // dynamically create destination sourcemap name
            if (mapNameGenerator) {
                try {
                    options.sourceMap = mapNameGenerator(f.dest);
                } catch (e) {
                    var err = new Error('SourceMapName failed.');
                    err.origError = e;
                    grunt.fail.warn(err);
                }
            }

            // dynamically create incoming sourcemap names
            if (mapInNameGenerator) {
                try {
                    options.sourceMapIn = mapInNameGenerator(src[0]);
                } catch (e) {
                    var err = new Error('SourceMapInName failed.');
                    err.origError = e;
                    grunt.fail.warn(err);
                }
            }

            // dynamically create sourceMappingURL
            if (mappingURLGenerator) {
                try {
                    options.sourceMappingURL = mappingURLGenerator(f.dest);
                } catch (e) {
                    var err = new Error('SourceMappingURL failed.');
                    err.origError = e;
                    grunt.fail.warn(err);
                }
            }

            // Minify files, warn and fail on error.
            if (options.warnings === false) {
                options.compress = false;
            }

            var result;
            try {
                result = uglify.minify(src, f.dest, options);
            } catch (e) {
                console.log(e);
                var err = new Error('Uglification failed.');
                if (e.message) {
                    err.message += '\n' + e.message + '. \n';
                    if (e.line) {
                        err.message += 'Line ' + e.line + ' in ' + src + '\n';
                    }
                }
                err.origError = e;
                grunt.log.warn('Uglifying source "' + src + '" failed.');
                grunt.fail.warn(err);
            }

            // Concat minified source + footer
            var output = result.min + footer;

            // Only prepend banner if uglify hasn't taken care of it as part of the preamble
            if (!options.sourceMap) {
                output = banner + output;
            }

            // Write the destination file.
            grunt.file.write(f.dest, output);

            // Write source map
            if (options.sourceMap) {
                grunt.file.write(options.sourceMap, result.sourceMap);
                grunt.log.writeln('File ' + chalk.cyan(options.sourceMap) + ' created (source map).');
            }

            // Print a success message.
            grunt.log.writeln('File ' + chalk.cyan(f.dest) + ' created.');

            // ...and report some size information.
            if (options.report) {
                contrib.minMaxInfo(output, result.max, options.report);
            }
        });
    }

    grunt.registerMultiTask('uglify_parallel', 'parallel uglify for parallel', function () {
        // Merge task-specific and/or target-specific options with these defaults.
        var done = this.async();
        var options = this.options({
            limit: require('os').cpus().length,
            banner: '',
            footer: '',
            compress: {
                warnings: false
            },
            mangle: {},
            beautify: false,
            report: false,
            warnings: false
        });

        if (options.process === true) {
            options.process = {};
        }

        if (options.limit > this.files.length) {
            options.limit = this.files.length;
        }

        var files = {};
        for (var i = 0; i !== options.limit; ++i) {
            files["" + i] = [];
        }
        this.files.forEach(function (fileObj, index) {
            var i = index % options.limit;
            files["" + i].push(fileObj);
        });
        var tasks = [];
        _.each(files, function(items, index) {
            tasks.push(function() {
                minify(items, options);
            });
        });
        async.parallel(tasks);
    });

};
