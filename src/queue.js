"use strict";
var ASSERT = require("./assert");
function arrayMove(src, srcIndex, dst, dstIndex, len) {  // 相当于复制数组， 并把原数组里复制了的元素用0代替
    for (var j = 0; j < len; ++j) {
        dst[j + dstIndex] = src[j + srcIndex];
        src[j + srcIndex] = void 0;
    }
}

function Queue(capacity) {   
    this._capacity = capacity;
    this._length = 0;
    this._front = 0;
}

Queue.prototype._willBeOverCapacity = function (size) {  // 像是 返回 大于的情况 ？
    return this._capacity < size;
};

Queue.prototype._pushOne = function (arg) {  // 初步  capacity 为初始容量，添加一个参数， 容量减一， _length加一
    var length = this.length();  // 用于获取 this._length 的值
    this._checkCapacity(length + 1);
    var i = (this._front + length) & (this._capacity - 1);  // 位与 ？
    this[i] = arg;
    this._length = length + 1;
};

Queue.prototype.push = function (fn, receiver, arg) {
    ASSERT(arguments.length === 3);   // 保证只接收三个参数
    ASSERT(typeof fn === "function");  // 保证fn 必须为函数
    var length = this.length() + 3;
    if (this._willBeOverCapacity(length)) { 
        //The fast array copies expect the
        //underlying array to be filled completely
        this._pushOne(fn);
        this._pushOne(receiver);
        this._pushOne(arg);
        return;
    }
    var j = this._front + length - 3;
    this._checkCapacity(length);
    var wrapMask = this._capacity - 1;
    this[(j + 0) & wrapMask] = fn;
    this[(j + 1) & wrapMask] = receiver;
    this[(j + 2) & wrapMask] = arg;
    this._length = length;
};

Queue.prototype.shift = function () {  // 取出一个
    ASSERT(this.length() > 0);
    var front = this._front,
        ret = this[front];

    this[front] = undefined;
    this._front = (front + 1) & (this._capacity - 1);
    this._length--;
    return ret;
};

Queue.prototype.length = function () {
    return this._length;
};

Queue.prototype._checkCapacity = function (size) {   // 判断并调整 capacity 的大小 
    if (this._capacity < size) {
        this._resizeTo(this._capacity << 1);  // 2 倍
    }
};

Queue.prototype._resizeTo = function (capacity) {
    var oldCapacity = this._capacity;
    this._capacity = capacity;
    var front = this._front;
    var length = this._length; 
    var moveItemsCount = (front + length) & (oldCapacity - 1);  // 移动的项数
    arrayMove(this, 0, this, oldCapacity, moveItemsCount);
};

module.exports = Queue;
