"use strict";
var ASSERT = require("./assert");
var es5 = require("./es5");
// Assume CSP if browser
var canEvaluate = typeof navigator == "undefined";

//Try catch is not supported in optimizing
//compiler, so it is isolated
var errorObj = {e: {}};
var tryCatchTarget;
var globalObject = typeof self !== "undefined" ? self :
    typeof window !== "undefined" ? window :
    typeof global !== "undefined" ? global :
    this !== undefined ? this : null;

function tryCatcher() {
    try {
        var target = tryCatchTarget;
        tryCatchTarget = null;
        return target.apply(this, arguments);
    } catch (e) {
        errorObj.e = e;
        return errorObj;
    }
}
function tryCatch(fn) {
    ASSERT(typeof fn === "function");
    tryCatchTarget = fn;
    return tryCatcher;
}

//Un-magical enough that using this doesn't prevent
//extending classes from outside using any convention
var inherits = function(Child, Parent) {
    var hasProp = {}.hasOwnProperty;  // 获取一个作用空间

    function T() {
        this.constructor = Child;
        this.constructor$ = Parent;
        for (var propertyName in Parent.prototype) {  // 迭代Parent的原型 获取属性名
            if (hasProp.call(Parent.prototype, propertyName) &&  // 如果属性是Parent自己的
                propertyName.charAt(propertyName.length-1) !== "$"  // 属性名最后不带 $ ( 排除已用inherits处理过的？)
           ) {
                this[propertyName + "$"] = Parent.prototype[propertyName];
            }
        }
    }
    T.prototype = Parent.prototype;
    Child.prototype = new T();
    return Child.prototype;
};


function isPrimitive(val) {  // 判断是否是基本类型
    return val == null || val === true || val === false ||
        typeof val === "string" || typeof val === "number";

}

function isObject(value) {  // 判断是否是 object 类型 如 数组， 对象， 函数
    return typeof value === "function" ||
           typeof value === "object" && value !== null;
}

function maybeWrapAsError(maybeError) {  // 格式化为一个错误类型
    if (!isPrimitive(maybeError)) return maybeError;

    return new Error(safeToString(maybeError)); // 如果为基本类型， 就返回一个错误对象
}

function withAppended(target, appendee) {  // 给目标数组添加一个值 ？
    var len = target.length;
    var ret = new Array(len + 1);
    var i;
    for (i = 0; i < len; ++i) {
        ret[i] = target[i];
    }
    ret[i] = appendee;
    return ret;
}

function getDataPropertyOrDefault(obj, key, defaultValue) {  // 获取对像某个属性的值
    if (es5.isES5) {
        // 获取对象的属性的特性， 如果这个属性是访问器属性， 那么返回的对象的属性有 configurable、emumerable、get、set， 如果是数据属性这个对象
        // 的属性有 configurable、emumerable、writable、value； 如果不存在这个属性那么返回 undefined
        var desc = Object.getOwnPropertyDescriptor(obj, key); 
                                                           

        if (desc != null) { //  undefined != null   false,  undefined !== null  true
            return desc.get == null && desc.set == null  // 判断是不是访问器属性
                    ? desc.value
                    : defaultValue;
        }
    } else {
        return {}.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
    }
}

function notEnumerableProp(obj, name, value) {  // 给对象添加一个不可迭代的属性 name 值为 value
    if (isPrimitive(obj)) return obj;
    var descriptor = {  // 定义一个描述符对象
        value: value,
        configurable: true,
        enumerable: false,
        writable: true
    };
    es5.defineProperty(obj, name, descriptor);  
    return obj;
}

function thrower(r) {   // 用于抛出错误  封装？
    throw r;
}

var inheritedDataKeys = (function() {
    var excludedPrototypes = [
        Array.prototype,
        Object.prototype,
        Function.prototype
    ];

    var isExcludedProto = function(val) {  // 排除excludedPrototypes所定义的对象的原型
        for (var i = 0; i < excludedPrototypes.length; ++i) {
            if (excludedPrototypes[i] === val) {
                return true;
            }
        }
        return false;
    };

    if (es5.isES5) {
        // getOwnPropertyNames  用于获取对象的属性名称， 并返回一个由属性名称组成的数组
        var getKeys = Object.getOwnPropertyNames;
        return function(obj) {   // 获取整个原型链上的所有属性， 不包含excludedPrototypes所定义的顶端原型
            var ret = [];
            var visitedKeys = Object.create(null); // 创建一个没有任何属性的空对象(和直接赋值a = {}不同 a会继承原型的属性， 而visitedKeys不会）
            while (obj != null && !isExcludedProto(obj)) {  // obj不为null 且 obj
                var keys;
                try {
                    keys = getKeys(obj);
                } catch (e) {
                    return ret;
                }
                for (var i = 0; i < keys.length; ++i) {
                    var key = keys[i];
                    if (visitedKeys[key]) continue; // 判断是否已经检察过这个属性
                    visitedKeys[key] = true; 
                    var desc = Object.getOwnPropertyDescriptor(obj, key);
                    if (desc != null && desc.get == null && desc.set == null) { // 只获取这个对象的数据属性
                        ret.push(key);
                    }
                }
                obj = es5.getPrototypeOf(obj);  // 获取这个对象的原型
            }
            return ret;
        };
    } else {
        var hasProp = {}.hasOwnProperty;
        return function(obj) {
            if (isExcludedProto(obj)) return [];
            var ret = [];

            /*jshint forin:false */
            enumeration: for (var key in obj) {
                if (hasProp.call(obj, key)) {
                    ret.push(key);
                } else {
                    for (var i = 0; i < excludedPrototypes.length; ++i) {
                        if (hasProp.call(excludedPrototypes[i], key)) {
                            continue enumeration;
                        }
                    }
                    ret.push(key);
                }
            }
            return ret;
        };
    }

})();

var thisAssignmentPattern = /this\s*\.\s*\S+\s*=/;
function isClass(fn) {  
    try {
        if (typeof fn === "function") {
            var keys = es5.names(fn.prototype);  // names:  Object.getOwnPropertyNames

            var hasMethods = es5.isES5 && keys.length > 1;
            var hasMethodsOtherThanConstructor = keys.length > 0 &&
                !(keys.length === 1 && keys[0] === "constructor");  // 含有处理constructor属性外的其他属性
            var hasThisAssignmentAndStaticMethods =
                // fn + "" 会把 fn函数的代码 以字符串形式输出出来， 如果fn是构造函数的表达式， 那么输出 "[object Object]"
                thisAssignmentPattern.test(fn + "") && es5.names(fn).length > 0; // 至少含有constructor
                // 判断是否含有this
            
            if (hasMethods || hasMethodsOtherThanConstructor ||
                hasThisAssignmentAndStaticMethods) {
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

function toFastProperties(obj) {
    /*jshint -W027,-W055,-W031*/
    function FakeConstructor() {}
    FakeConstructor.prototype = obj;
    var receiver = new FakeConstructor();
    function ic() {
        return typeof receiver.foo;
    }
    ic();
    ic();
    ASSERT("%HasFastProperties", true, obj);
    return obj;
    // Prevent the function from being optimized through dead code elimination
    // or further optimizations. This code is never reached but even using eval
    // in unreachable code causes v8 to not optimize functions.
    eval(obj);
}

var rident = /^[a-z$_][a-z$_0-9]*$/i;
function isIdentifier(str) {
    return rident.test(str);
}

function filledRange(count, prefix, suffix) {   // 数组填充
    var ret = new Array(count);
    for(var i = 0; i < count; ++i) {
        ret[i] = prefix + i + suffix;
    }
    return ret;
}

function safeToString(obj) {   // 转化为 string 类型
    try {
        return obj + "";
    } catch (e) {
        return "[no string representation]";
    }
}

function isError(obj) {  // 判断是否为错误类型
    return obj instanceof Error ||   // 继承自 Error 对象
        (obj !== null &&             // 或者 是自定义的错误类型，(自定义错误类型需要为新创建的错误类型指定name和message属性)
           typeof obj === "object" &&
           typeof obj.message === "string" &&
           typeof obj.name === "string");
}

function markAsOriginatingFromRejection(e) {
    try {
        notEnumerableProp(e, OPERATIONAL_ERROR_KEY, true);
    }
    catch(ignore) {}
}

function originatesFromRejection(e) {  // e 为一个对象
    if (e == null) return false;
    return ((e instanceof Error[BLUEBIRD_ERRORS].OperationalError) ||  // e 继承自 自定义的OpreationalError
        e[OPERATIONAL_ERROR_KEY] === true);
}

function canAttachTrace(obj) {
    return isError(obj) && es5.propertyIsWritable(obj, "stack");  // obj的stack属性 是否是可写的， 且obj是否是错误对象
}

var ensureErrorObject = (function() {
    if (!("stack" in new Error())) {  // 经测试， stack 是给 Error 对象的原型添加 stack 属性
        return function(value) {
            if (canAttachTrace(value)) return value;
            try {throw new Error(safeToString(value));}
            catch(err) {return err;}
        };
    } else {
        return function(value) {
            if (canAttachTrace(value)) return value;
            return new Error(safeToString(value));
        };
    }
})();

function classString(obj) {
    return {}.toString.call(obj);  // 获取obj的类型
}

function copyDescriptors(from, to, filter) {  // filter 为过滤函数
    var keys = es5.names(from);  // 获取 from 的自有属性
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        if (filter(key)) {
            try {
                es5.defineProperty(to, key, es5.getDescriptor(from, key));
            } catch (ignore) {}
        }
    }
}

var asArray = function(v) {
    if (es5.isArray(v)) {  // 判断 v 是否为数组
        return v;
    }
    return null;
};

if (typeof Symbol !== "undefined" && Symbol.iterator) {
    var ArrayFrom = typeof Array.from === "function" ? function(v) {  // 判断是否存在 复写 Array 对象 此对象含有 from 属性
        return Array.from(v);
    } : function(v) {
        var ret = [];
        var it = v[Symbol.iterator]();
        var itResult;
        while (!((itResult = it.next()).done)) {
            ret.push(itResult.value);
        }
        return ret;
    };

    asArray = function(v) {
        if (es5.isArray(v)) {
            return v;
        } else if (v != null && typeof v[Symbol.iterator] === "function") {
            return ArrayFrom(v);
        }
        return null;
    };
}

var isNode = typeof process !== "undefined" &&   // 判断是不是 node 
        classString(process).toLowerCase() === "[object process]";

var hasEnvVariables = typeof process !== "undefined" &&
    typeof process.env !== "undefined";

function env(key) {
    return hasEnvVariables ? process.env[key] : undefined;
}

function getNativePromise() {  // 用于获取设备支持的原生 Promise
    if (typeof Promise === "function") {
        try {
            var promise = new Promise(function(){});
            if ({}.toString.call(promise) === "[object Promise]") {  // 浏览器Console直接执行 {}.toString.call(promise) 会报 Uncaught SyntaxError: Unexpected token .
                                                                     // var str = {}.toString; str.call(promise) 正确
                return Promise;
            }
        } catch (e) {}
    }
}

function domainBind(self, cb) {
    return self.bind(cb);
}

var ret = {
    isClass: isClass,
    isIdentifier: isIdentifier,
    inheritedDataKeys: inheritedDataKeys,
    getDataPropertyOrDefault: getDataPropertyOrDefault,
    thrower: thrower,
    isArray: es5.isArray,
    asArray: asArray,
    notEnumerableProp: notEnumerableProp,
    isPrimitive: isPrimitive,
    isObject: isObject,
    isError: isError,
    canEvaluate: canEvaluate,
    errorObj: errorObj,
    tryCatch: tryCatch,
    inherits: inherits,
    withAppended: withAppended,
    maybeWrapAsError: maybeWrapAsError,
    toFastProperties: toFastProperties,
    filledRange: filledRange,
    toString: safeToString,
    canAttachTrace: canAttachTrace,
    ensureErrorObject: ensureErrorObject,
    originatesFromRejection: originatesFromRejection,
    markAsOriginatingFromRejection: markAsOriginatingFromRejection,
    classString: classString,
    copyDescriptors: copyDescriptors,
    hasDevTools: typeof chrome !== "undefined" && chrome &&
                 typeof chrome.loadTimes === "function",
    isNode: isNode,
    hasEnvVariables: hasEnvVariables,
    env: env,
    global: globalObject,
    getNativePromise: getNativePromise,
    domainBind: domainBind
};
ret.isRecentNode = ret.isNode && (function() {
    var version = process.versions.node.split(".").map(Number);
    return (version[0] === 0 && version[1] > 10) || (version[0] > 0);
})();

if (ret.isNode) ret.toFastProperties(process);

try {throw new Error(); } catch (e) {ret.lastLineError = e;}
module.exports = ret;
