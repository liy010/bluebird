"use strict";
module.exports = (function(){
var AssertionError = (function() {
    function AssertionError(a) {
        this.constructor$(a);
        this.message = a;
        this.name = "AssertionError";
    }
    AssertionError.prototype = new Error();
    AssertionError.prototype.constructor = AssertionError;
    AssertionError.prototype.constructor$ = Error;
    return AssertionError;
})();

function getParams(args) {
    var params = [];
    for (var i = 0; i < args.length; ++i) params.push("arg" + i);
    return params;
}

function nativeAssert(callName, args, expect) {
    try {
        var params = getParams(args);
        var constructorArgs = params;
        constructorArgs.push("return " +
                callName + "("+ params.join(",") + ");");
        // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Function
        // const adder = new Function("a", "b", "return a + b");
        // adder(6, 2)   8
        // apply 把constructorArgs 里面的 元素一个个传递到构造函数里(其中params为形参，最后一个为函数体)， 返回一个接收特定参数的函数
        var fn = Function.apply(null, constructorArgs);
        // 把 args 里的元素通过参数传递进fn
        return fn.apply(null, args);
    } catch (e) {
        if (!(e instanceof SyntaxError)) {
            throw e;
        } else {
            return expect;
        }
    }
}

return function assert(boolExpr, message) {  // 接收一个布尔参数 和 一个信息参数
    if (boolExpr === true) return;

    if (typeof boolExpr === "string" &&
        boolExpr.charAt(0) === "%") {  // util.js 207 lines 使用过 前置 %
        var nativeCallName = boolExpr;
        INLINE_SLICE(args, arguments, 2);
        if (nativeAssert(nativeCallName, args, message) === message) return;
        message = (nativeCallName + " !== " + message);
    }

    var ret = new AssertionError(message);
    // http://developer.51cto.com/art/201704/538067.htm   关于Error.captureStackTrace
    if (Error.captureStackTrace) {
        Error.captureStackTrace(ret, assert);
    }
    throw ret;
};
})();
