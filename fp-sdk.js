/* FacePlugin public SDK 0.0.1, MIT. Local adaptations: phone/faceplugin/ */
var FacePlugin={};
(function(){const m=[function(module,exports,require){var iota = require(1)
var isBuffer = require(2)

var hasTypedArrays  = ((typeof Float64Array) !== "undefined")

function compare1st(a, b) {
  return a[0] - b[0]
}

function order() {
  var stride = this.stride
  var terms = new Array(stride.length)
  var i
  for(i=0; i<terms.length; ++i) {
    terms[i] = [Math.abs(stride[i]), i]
  }
  terms.sort(compare1st)
  var result = new Array(terms.length)
  for(i=0; i<result.length; ++i) {
    result[i] = terms[i][1]
  }
  return result
}

function compileConstructor(dtype, dimension) {
  var className = ["View", dimension, "d", dtype].join("")
  if(dimension < 0) {
    className = "View_Nil" + dtype
  }
  var useGetters = (dtype === "generic")

  if(dimension === -1) {
    //Special case for trivial arrays
    var code =
      "function "+className+"(a){this.data=a;};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return -1};\
proto.size=0;\
proto.dimension=-1;\
proto.shape=proto.stride=proto.order=[];\
proto.lo=proto.hi=proto.transpose=proto.step=\
function(){return new "+className+"(this.data);};\
proto.get=proto.set=function(){};\
proto.pick=function(){return null};\
return function construct_"+className+"(a){return new "+className+"(a);}"
    var procedure = new Function(code)
    return procedure()
  } else if(dimension === 0) {
    //Special case for 0d arrays
    var code =
      "function "+className+"(a,d) {\
this.data = a;\
this.offset = d\
};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return this.offset};\
proto.dimension=0;\
proto.size=1;\
proto.shape=\
proto.stride=\
proto.order=[];\
proto.lo=\
proto.hi=\
proto.transpose=\
proto.step=function "+className+"_copy() {\
return new "+className+"(this.data,this.offset)\
};\
proto.pick=function "+className+"_pick(){\
return TrivialArray(this.data);\
};\
proto.valueOf=proto.get=function "+className+"_get(){\
return "+(useGetters ? "this.data.get(this.offset)" : "this.data[this.offset]")+
"};\
proto.set=function "+className+"_set(v){\
return "+(useGetters ? "this.data.set(this.offset,v)" : "this.data[this.offset]=v")+"\
};\
return function construct_"+className+"(a,b,c,d){return new "+className+"(a,d)}"
    var procedure = new Function("TrivialArray", code)
    return procedure(CACHED_CONSTRUCTORS[dtype][0])
  }

  var code = ["'use strict'"]

  //Create constructor for view
  var indices = iota(dimension)
  var args = indices.map(function(i) { return "i"+i })
  var index_str = "this.offset+" + indices.map(function(i) {
        return "this.stride[" + i + "]*i" + i
      }).join("+")
  var shapeArg = indices.map(function(i) {
      return "b"+i
    }).join(",")
  var strideArg = indices.map(function(i) {
      return "c"+i
    }).join(",")
  code.push(
    "function "+className+"(a," + shapeArg + "," + strideArg + ",d){this.data=a",
      "this.shape=[" + shapeArg + "]",
      "this.stride=[" + strideArg + "]",
      "this.offset=d|0}",
    "var proto="+className+".prototype",
    "proto.dtype='"+dtype+"'",
    "proto.dimension="+dimension)

  //view.size:
  code.push("Object.defineProperty(proto,'size',{get:function "+className+"_size(){\
return "+indices.map(function(i) { return "this.shape["+i+"]" }).join("*"),
"}})")

  //view.order:
  if(dimension === 1) {
    code.push("proto.order=[0]")
  } else {
    code.push("Object.defineProperty(proto,'order',{get:")
    if(dimension < 4) {
      code.push("function "+className+"_order(){")
      if(dimension === 2) {
        code.push("return (Math.abs(this.stride[0])>Math.abs(this.stride[1]))?[1,0]:[0,1]}})")
      } else if(dimension === 3) {
        code.push(
"var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);\
if(s0>s1){\
if(s1>s2){\
return [2,1,0];\
}else if(s0>s2){\
return [1,2,0];\
}else{\
return [1,0,2];\
}\
}else if(s0>s2){\
return [2,0,1];\
}else if(s2>s1){\
return [0,1,2];\
}else{\
return [0,2,1];\
}}})")
      }
    } else {
      code.push("ORDER})")
    }
  }

  //view.set(i0, ..., v):
  code.push(
"proto.set=function "+className+"_set("+args.join(",")+",v){")
  if(useGetters) {
    code.push("return this.data.set("+index_str+",v)}")
  } else {
    code.push("return this.data["+index_str+"]=v}")
  }

  //view.get(i0, ...):
  code.push("proto.get=function "+className+"_get("+args.join(",")+"){")
  if(useGetters) {
    code.push("return this.data.get("+index_str+")}")
  } else {
    code.push("return this.data["+index_str+"]}")
  }

  //view.index:
  code.push(
    "proto.index=function "+className+"_index(", args.join(), "){return "+index_str+"}")

  //view.hi():
  code.push("proto.hi=function "+className+"_hi("+args.join(",")+"){return new "+className+"(this.data,"+
    indices.map(function(i) {
      return ["(typeof i",i,"!=='number'||i",i,"<0)?this.shape[", i, "]:i", i,"|0"].join("")
    }).join(",")+","+
    indices.map(function(i) {
      return "this.stride["+i + "]"
    }).join(",")+",this.offset)}")

  //view.lo():
  var a_vars = indices.map(function(i) { return "a"+i+"=this.shape["+i+"]" })
  var c_vars = indices.map(function(i) { return "c"+i+"=this.stride["+i+"]" })
  code.push("proto.lo=function "+className+"_lo("+args.join(",")+"){var b=this.offset,d=0,"+a_vars.join(",")+","+c_vars.join(","))
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'&&i"+i+">=0){\
d=i"+i+"|0;\
b+=c"+i+"*d;\
a"+i+"-=d}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a"+i
    }).join(",")+","+
    indices.map(function(i) {
      return "c"+i
    }).join(",")+",b)}")

  //view.step():
  code.push("proto.step=function "+className+"_step("+args.join(",")+"){var "+
    indices.map(function(i) {
      return "a"+i+"=this.shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "b"+i+"=this.stride["+i+"]"
    }).join(",")+",c=this.offset,d=0,ceil=Math.ceil")
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'){\
d=i"+i+"|0;\
if(d<0){\
c+=b"+i+"*(a"+i+"-1);\
a"+i+"=ceil(-a"+i+"/d)\
}else{\
a"+i+"=ceil(a"+i+"/d)\
}\
b"+i+"*=d\
}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a" + i
    }).join(",")+","+
    indices.map(function(i) {
      return "b" + i
    }).join(",")+",c)}")

  //view.transpose():
  var tShape = new Array(dimension)
  var tStride = new Array(dimension)
  for(var i=0; i<dimension; ++i) {
    tShape[i] = "a[i"+i+"]"
    tStride[i] = "b[i"+i+"]"
  }
  code.push("proto.transpose=function "+className+"_transpose("+args+"){"+
    args.map(function(n,idx) { return n + "=(" + n + "===undefined?" + idx + ":" + n + "|0)"}).join(";"),
    "var a=this.shape,b=this.stride;return new "+className+"(this.data,"+tShape.join(",")+","+tStride.join(",")+",this.offset)}")

  //view.pick():
  code.push("proto.pick=function "+className+"_pick("+args+"){var a=[],b=[],c=this.offset")
  for(var i=0; i<dimension; ++i) {
    code.push("if(typeof i"+i+"==='number'&&i"+i+">=0){c=(c+this.stride["+i+"]*i"+i+")|0}else{a.push(this.shape["+i+"]);b.push(this.stride["+i+"])}")
  }
  code.push("var ctor=CTOR_LIST[a.length+1];return ctor(this.data,a,b,c)}")

  //Add return statement
  code.push("return function construct_"+className+"(data,shape,stride,offset){return new "+className+"(data,"+
    indices.map(function(i) {
      return "shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "stride["+i+"]"
    }).join(",")+",offset)}")

  //Compile procedure
  var procedure = new Function("CTOR_LIST", "ORDER", code.join("\n"))
  return procedure(CACHED_CONSTRUCTORS[dtype], order)
}

function arrayDType(data) {
  if(isBuffer(data)) {
    return "buffer"
  }
  if(hasTypedArrays) {
    switch(Object.prototype.toString.call(data)) {
      case "[object Float64Array]":
        return "float64"
      case "[object Float32Array]":
        return "float32"
      case "[object Int8Array]":
        return "int8"
      case "[object Int16Array]":
        return "int16"
      case "[object Int32Array]":
        return "int32"
      case "[object Uint8Array]":
        return "uint8"
      case "[object Uint16Array]":
        return "uint16"
      case "[object Uint32Array]":
        return "uint32"
      case "[object Uint8ClampedArray]":
        return "uint8_clamped"
      case "[object BigInt64Array]":
        return "bigint64"
      case "[object BigUint64Array]":
        return "biguint64"
    }
  }
  if(Array.isArray(data)) {
    return "array"
  }
  return "generic"
}

var CACHED_CONSTRUCTORS = {
  "float32":[],
  "float64":[],
  "int8":[],
  "int16":[],
  "int32":[],
  "uint8":[],
  "uint16":[],
  "uint32":[],
  "array":[],
  "uint8_clamped":[],
  "bigint64": [],
  "biguint64": [],
  "buffer":[],
  "generic":[]
}

;(function() {
  for(var id in CACHED_CONSTRUCTORS) {
    CACHED_CONSTRUCTORS[id].push(compileConstructor(id, -1))
  }
});

function wrappedNDArrayCtor(data, shape, stride, offset) {
  if(data === undefined) {
    var ctor = CACHED_CONSTRUCTORS.array[0]
    return ctor([])
  } else if(typeof data === "number") {
    data = [data]
  }
  if(shape === undefined) {
    shape = [ data.length ]
  }
  var d = shape.length
  if(stride === undefined) {
    stride = new Array(d)
    for(var i=d-1, sz=1; i>=0; --i) {
      stride[i] = sz
      sz *= shape[i]
    }
  }
  if(offset === undefined) {
    offset = 0
    for(var i=0; i<d; ++i) {
      if(stride[i] < 0) {
        offset -= (shape[i]-1)*stride[i]
      }
    }
  }
  var dtype = arrayDType(data)
  var ctor_list = CACHED_CONSTRUCTORS[dtype]
  while(ctor_list.length <= d+1) {
    ctor_list.push(compileConstructor(dtype, ctor_list.length-1))
  }
  var ctor = ctor_list[d+1]
  return ctor(data, shape, stride, offset)
}

module.exports = wrappedNDArrayCtor

},function(module,exports,require){"use strict"

function iota(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = i
  }
  return result
}

module.exports = iota
},function(module,exports,require){/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},function(module,exports,require){"use strict"

var compile = require(4)

var EmptyProc = {
  body: "",
  args: [],
  thisVars: [],
  localVars: []
}

function fixup(x) {
  if(!x) {
    return EmptyProc
  }
  for(var i=0; i<x.args.length; ++i) {
    var a = x.args[i]
    if(i === 0) {
      x.args[i] = {name: a, lvalue:true, rvalue: !!x.rvalue, count:x.count||1 }
    } else {
      x.args[i] = {name: a, lvalue:false, rvalue:true, count: 1}
    }
  }
  if(!x.thisVars) {
    x.thisVars = []
  }
  if(!x.localVars) {
    x.localVars = []
  }
  return x
}

function pcompile(user_args) {
  return compile({
    args:     user_args.args,
    pre:      fixup(user_args.pre),
    body:     fixup(user_args.body),
    post:     fixup(user_args.proc),
    funcName: user_args.funcName
  })
}

function makeOp(user_args) {
  var args = []
  for(var i=0; i<user_args.args.length; ++i) {
    args.push("a"+i)
  }
  var wrapper = new Function("P", [
    "return function ", user_args.funcName, "_ndarrayops(", args.join(","), ") {P(", args.join(","), ");return a0}"
  ].join(""))
  return wrapper(pcompile(user_args))
}

var assign_ops = {
  add:  "+",
  sub:  "-",
  mul:  "*",
  div:  "/",
  mod:  "%",
  band: "&",
  bor:  "|",
  bxor: "^",
  lshift: "<<",
  rshift: ">>",
  rrshift: ">>>"
}
;(function(){
  for(var id in assign_ops) {
    var op = assign_ops[id]
    exports[id] = makeOp({
      args: ["array","array","array"],
      body: {args:["a","b","c"],
             body: "a=b"+op+"c"},
      funcName: id
    })
    exports[id+"eq"] = makeOp({
      args: ["array","array"],
      body: {args:["a","b"],
             body:"a"+op+"=b"},
      rvalue: true,
      funcName: id+"eq"
    })
    exports[id+"s"] = makeOp({
      args: ["array", "array", "scalar"],
      body: {args:["a","b","s"],
             body:"a=b"+op+"s"},
      funcName: id+"s"
    })
    exports[id+"seq"] = makeOp({
      args: ["array","scalar"],
      body: {args:["a","s"],
             body:"a"+op+"=s"},
      rvalue: true,
      funcName: id+"seq"
    })
  }
})();

var unary_ops = {
  not: "!",
  bnot: "~",
  neg: "-",
  recip: "1.0/"
}
;(function(){
  for(var id in unary_ops) {
    var op = unary_ops[id]
    exports[id] = makeOp({
      args: ["array", "array"],
      body: {args:["a","b"],
             body:"a="+op+"b"},
      funcName: id
    })
    exports[id+"eq"] = makeOp({
      args: ["array"],
      body: {args:["a"],
             body:"a="+op+"a"},
      rvalue: true,
      count: 2,
      funcName: id+"eq"
    })
  }
})();

var binary_ops = {
  and: "&&",
  or: "||",
  eq: "===",
  neq: "!==",
  lt: "<",
  gt: ">",
  leq: "<=",
  geq: ">="
}
;(function() {
  for(var id in binary_ops) {
    var op = binary_ops[id]
    exports[id] = makeOp({
      args: ["array","array","array"],
      body: {args:["a", "b", "c"],
             body:"a=b"+op+"c"},
      funcName: id
    })
    exports[id+"s"] = makeOp({
      args: ["array","array","scalar"],
      body: {args:["a", "b", "s"],
             body:"a=b"+op+"s"},
      funcName: id+"s"
    })
    exports[id+"eq"] = makeOp({
      args: ["array", "array"],
      body: {args:["a", "b"],
             body:"a=a"+op+"b"},
      rvalue:true,
      count:2,
      funcName: id+"eq"
    })
    exports[id+"seq"] = makeOp({
      args: ["array", "scalar"],
      body: {args:["a","s"],
             body:"a=a"+op+"s"},
      rvalue:true,
      count:2,
      funcName: id+"seq"
    })
  }
})();

var math_unary = [
  "abs",
  "acos",
  "asin",
  "atan",
  "ceil",
  "cos",
  "exp",
  "floor",
  "log",
  "round",
  "sin",
  "sqrt",
  "tan"
]
;(function() {
  for(var i=0; i<math_unary.length; ++i) {
    var f = math_unary[i]
    exports[f] = makeOp({
                    args: ["array", "array"],
                    pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                    body: {args:["a","b"], body:"a=this_f(b)", thisVars:["this_f"]},
                    funcName: f
                  })
    exports[f+"eq"] = makeOp({
                      args: ["array"],
                      pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                      body: {args: ["a"], body:"a=this_f(a)", thisVars:["this_f"]},
                      rvalue: true,
                      count: 2,
                      funcName: f+"eq"
                    })
  }
})();

var math_comm = [
  "max",
  "min",
  "atan2",
  "pow"
]
;(function(){
  for(var i=0; i<math_comm.length; ++i) {
    var f= math_comm[i]
    exports[f] = makeOp({
                  args:["array", "array", "array"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b","c"], body:"a=this_f(b,c)", thisVars:["this_f"]},
                  funcName: f
                })
    exports[f+"s"] = makeOp({
                  args:["array", "array", "scalar"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b","c"], body:"a=this_f(b,c)", thisVars:["this_f"]},
                  funcName: f+"s"
                  })
    exports[f+"eq"] = makeOp({ args:["array", "array"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b"], body:"a=this_f(a,b)", thisVars:["this_f"]},
                  rvalue: true,
                  count: 2,
                  funcName: f+"eq"
                  })
    exports[f+"seq"] = makeOp({ args:["array", "scalar"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b"], body:"a=this_f(a,b)", thisVars:["this_f"]},
                  rvalue:true,
                  count:2,
                  funcName: f+"seq"
                  })
  }
})();

var math_noncomm = [
  "atan2",
  "pow"
]
;(function(){
  for(var i=0; i<math_noncomm.length; ++i) {
    var f= math_noncomm[i]
    exports[f+"op"] = makeOp({
                  args:["array", "array", "array"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b","c"], body:"a=this_f(c,b)", thisVars:["this_f"]},
                  funcName: f+"op"
                })
    exports[f+"ops"] = makeOp({
                  args:["array", "array", "scalar"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b","c"], body:"a=this_f(c,b)", thisVars:["this_f"]},
                  funcName: f+"ops"
                  })
    exports[f+"opeq"] = makeOp({ args:["array", "array"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b"], body:"a=this_f(b,a)", thisVars:["this_f"]},
                  rvalue: true,
                  count: 2,
                  funcName: f+"opeq"
                  })
    exports[f+"opseq"] = makeOp({ args:["array", "scalar"],
                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
                  body: {args:["a","b"], body:"a=this_f(b,a)", thisVars:["this_f"]},
                  rvalue:true,
                  count:2,
                  funcName: f+"opseq"
                  })
  }
})();

exports.any = compile({
  args:["array"],
  pre: EmptyProc,
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:1}], body: "if(a){return true}", localVars: [], thisVars: []},
  post: {args:[], localVars:[], thisVars:[], body:"return false"},
  funcName: "any"
})

exports.all = compile({
  args:["array"],
  pre: EmptyProc,
  body: {args:[{name:"x", lvalue:false, rvalue:true, count:1}], body: "if(!x){return false}", localVars: [], thisVars: []},
  post: {args:[], localVars:[], thisVars:[], body:"return true"},
  funcName: "all"
})

exports.sum = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:1}], body: "this_s+=a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "sum"
})

exports.prod = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=1"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:1}], body: "this_s*=a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "prod"
})

exports.norm2squared = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:2}], body: "this_s+=a*a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "norm2squared"
})
  
exports.norm2 = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:2}], body: "this_s+=a*a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return Math.sqrt(this_s)"},
  funcName: "norm2"
})
  

exports.norminf = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:4}], body:"if(-a>this_s){this_s=-a}else if(a>this_s){this_s=a}", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "norminf"
})

exports.norm1 = compile({
  args:["array"],
  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
  body: {args:[{name:"a", lvalue:false, rvalue:true, count:3}], body: "this_s+=a<0?-a:a", localVars: [], thisVars: ["this_s"]},
  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
  funcName: "norm1"
})

exports.sup = compile({
  args: [ "array" ],
  pre:
   { body: "this_h=-Infinity",
     args: [],
     thisVars: [ "this_h" ],
     localVars: [] },
  body:
   { body: "if(_inline_1_arg0_>this_h)this_h=_inline_1_arg0_",
     args: [{"name":"_inline_1_arg0_","lvalue":false,"rvalue":true,"count":2} ],
     thisVars: [ "this_h" ],
     localVars: [] },
  post:
   { body: "return this_h",
     args: [],
     thisVars: [ "this_h" ],
     localVars: [] }
 })

exports.inf = compile({
  args: [ "array" ],
  pre:
   { body: "this_h=Infinity",
     args: [],
     thisVars: [ "this_h" ],
     localVars: [] },
  body:
   { body: "if(_inline_1_arg0_<this_h)this_h=_inline_1_arg0_",
     args: [{"name":"_inline_1_arg0_","lvalue":false,"rvalue":true,"count":2} ],
     thisVars: [ "this_h" ],
     localVars: [] },
  post:
   { body: "return this_h",
     args: [],
     thisVars: [ "this_h" ],
     localVars: [] }
 })

exports.argmin = compile({
  args:["index","array","shape"],
  pre:{
    body:"{this_v=Infinity;this_i=_inline_0_arg2_.slice(0)}",
    args:[
      {name:"_inline_0_arg0_",lvalue:false,rvalue:false,count:0},
      {name:"_inline_0_arg1_",lvalue:false,rvalue:false,count:0},
      {name:"_inline_0_arg2_",lvalue:false,rvalue:true,count:1}
      ],
    thisVars:["this_i","this_v"],
    localVars:[]},
  body:{
    body:"{if(_inline_1_arg1_<this_v){this_v=_inline_1_arg1_;for(var _inline_1_k=0;_inline_1_k<_inline_1_arg0_.length;++_inline_1_k){this_i[_inline_1_k]=_inline_1_arg0_[_inline_1_k]}}}",
    args:[
      {name:"_inline_1_arg0_",lvalue:false,rvalue:true,count:2},
      {name:"_inline_1_arg1_",lvalue:false,rvalue:true,count:2}],
    thisVars:["this_i","this_v"],
    localVars:["_inline_1_k"]},
  post:{
    body:"{return this_i}",
    args:[],
    thisVars:["this_i"],
    localVars:[]}
})

exports.argmax = compile({
  args:["index","array","shape"],
  pre:{
    body:"{this_v=-Infinity;this_i=_inline_0_arg2_.slice(0)}",
    args:[
      {name:"_inline_0_arg0_",lvalue:false,rvalue:false,count:0},
      {name:"_inline_0_arg1_",lvalue:false,rvalue:false,count:0},
      {name:"_inline_0_arg2_",lvalue:false,rvalue:true,count:1}
      ],
    thisVars:["this_i","this_v"],
    localVars:[]},
  body:{
    body:"{if(_inline_1_arg1_>this_v){this_v=_inline_1_arg1_;for(var _inline_1_k=0;_inline_1_k<_inline_1_arg0_.length;++_inline_1_k){this_i[_inline_1_k]=_inline_1_arg0_[_inline_1_k]}}}",
    args:[
      {name:"_inline_1_arg0_",lvalue:false,rvalue:true,count:2},
      {name:"_inline_1_arg1_",lvalue:false,rvalue:true,count:2}],
    thisVars:["this_i","this_v"],
    localVars:["_inline_1_k"]},
  post:{
    body:"{return this_i}",
    args:[],
    thisVars:["this_i"],
    localVars:[]}
})  

exports.random = makeOp({
  args: ["array"],
  pre: {args:[], body:"this_f=Math.random", thisVars:["this_f"]},
  body: {args: ["a"], body:"a=this_f()", thisVars:["this_f"]},
  funcName: "random"
})

exports.assign = makeOp({
  args:["array", "array"],
  body: {args:["a", "b"], body:"a=b"},
  funcName: "assign" })

exports.assigns = makeOp({
  args:["array", "scalar"],
  body: {args:["a", "b"], body:"a=b"},
  funcName: "assigns" })


exports.equals = compile({
  args:["array", "array"],
  pre: EmptyProc,
  body: {args:[{name:"x", lvalue:false, rvalue:true, count:1},
               {name:"y", lvalue:false, rvalue:true, count:1}], 
        body: "if(x!==y){return false}", 
        localVars: [], 
        thisVars: []},
  post: {args:[], localVars:[], thisVars:[], body:"return true"},
  funcName: "equals"
})



},function(module,exports,require){"use strict"

var createThunk = require(5)

function Procedure() {
  this.argTypes = []
  this.shimArgs = []
  this.arrayArgs = []
  this.arrayBlockIndices = []
  this.scalarArgs = []
  this.offsetArgs = []
  this.offsetArgIndex = []
  this.indexArgs = []
  this.shapeArgs = []
  this.funcName = ""
  this.pre = null
  this.body = null
  this.post = null
  this.debug = false
}

function compileCwise(user_args) {
  //Create procedure
  var proc = new Procedure()
  
  //Parse blocks
  proc.pre    = user_args.pre
  proc.body   = user_args.body
  proc.post   = user_args.post

  //Parse arguments
  var proc_args = user_args.args.slice(0)
  proc.argTypes = proc_args
  for(var i=0; i<proc_args.length; ++i) {
    var arg_type = proc_args[i]
    if(arg_type === "array" || (typeof arg_type === "object" && arg_type.blockIndices)) {
      proc.argTypes[i] = "array"
      proc.arrayArgs.push(i)
      proc.arrayBlockIndices.push(arg_type.blockIndices ? arg_type.blockIndices : 0)
      proc.shimArgs.push("array" + i)
      if(i < proc.pre.args.length && proc.pre.args[i].count>0) {
        throw new Error("cwise: pre() block may not reference array args")
      }
      if(i < proc.post.args.length && proc.post.args[i].count>0) {
        throw new Error("cwise: post() block may not reference array args")
      }
    } else if(arg_type === "scalar") {
      proc.scalarArgs.push(i)
      proc.shimArgs.push("scalar" + i)
    } else if(arg_type === "index") {
      proc.indexArgs.push(i)
      if(i < proc.pre.args.length && proc.pre.args[i].count > 0) {
        throw new Error("cwise: pre() block may not reference array index")
      }
      if(i < proc.body.args.length && proc.body.args[i].lvalue) {
        throw new Error("cwise: body() block may not write to array index")
      }
      if(i < proc.post.args.length && proc.post.args[i].count > 0) {
        throw new Error("cwise: post() block may not reference array index")
      }
    } else if(arg_type === "shape") {
      proc.shapeArgs.push(i)
      if(i < proc.pre.args.length && proc.pre.args[i].lvalue) {
        throw new Error("cwise: pre() block may not write to array shape")
      }
      if(i < proc.body.args.length && proc.body.args[i].lvalue) {
        throw new Error("cwise: body() block may not write to array shape")
      }
      if(i < proc.post.args.length && proc.post.args[i].lvalue) {
        throw new Error("cwise: post() block may not write to array shape")
      }
    } else if(typeof arg_type === "object" && arg_type.offset) {
      proc.argTypes[i] = "offset"
      proc.offsetArgs.push({ array: arg_type.array, offset:arg_type.offset })
      proc.offsetArgIndex.push(i)
    } else {
      throw new Error("cwise: Unknown argument type " + proc_args[i])
    }
  }
  
  //Make sure at least one array argument was specified
  if(proc.arrayArgs.length <= 0) {
    throw new Error("cwise: No array arguments specified")
  }
  
  //Make sure arguments are correct
  if(proc.pre.args.length > proc_args.length) {
    throw new Error("cwise: Too many arguments in pre() block")
  }
  if(proc.body.args.length > proc_args.length) {
    throw new Error("cwise: Too many arguments in body() block")
  }
  if(proc.post.args.length > proc_args.length) {
    throw new Error("cwise: Too many arguments in post() block")
  }

  //Check debug flag
  proc.debug = !!user_args.printCode || !!user_args.debug
  
  //Retrieve name
  proc.funcName = user_args.funcName || "cwise"
  
  //Read in block size
  proc.blockSize = user_args.blockSize || 64

  return createThunk(proc)
}

module.exports = compileCwise

},function(module,exports,require){"use strict"

// The function below is called when constructing a cwise function object, and does the following:
// A function object is constructed which accepts as argument a compilation function and returns another function.
// It is this other function that is eventually returned by createThunk, and this function is the one that actually
// checks whether a certain pattern of arguments has already been used before and compiles new loops as needed.
// The compilation passed to the first function object is used for compiling new functions.
// Once this function object is created, it is called with compile as argument, where the first argument of compile
// is bound to "proc" (essentially containing a preprocessed version of the user arguments to cwise).
// So createThunk roughly works like this:
// function createThunk(proc) {
//   var thunk = function(compileBound) {
//     var CACHED = {}
//     return function(arrays and scalars) {
//       if (dtype and order of arrays in CACHED) {
//         var func = CACHED[dtype and order of arrays]
//       } else {
//         var func = CACHED[dtype and order of arrays] = compileBound(dtype and order of arrays)
//       }
//       return func(arrays and scalars)
//     }
//   }
//   return thunk(compile.bind1(proc))
// }

var compile = require(6)

function createThunk(proc) {
  var code = ["'use strict'", "var CACHED={}"]
  var vars = []
  var thunkName = proc.funcName + "_cwise_thunk"
  
  //Build thunk
  code.push(["return function ", thunkName, "(", proc.shimArgs.join(","), "){"].join(""))
  var typesig = []
  var string_typesig = []
  var proc_args = [["array",proc.arrayArgs[0],".shape.slice(", // Slice shape so that we only retain the shape over which we iterate (which gets passed to the cwise operator as SS).
                    Math.max(0,proc.arrayBlockIndices[0]),proc.arrayBlockIndices[0]<0?(","+proc.arrayBlockIndices[0]+")"):")"].join("")]
  var shapeLengthConditions = [], shapeConditions = []
  // Process array arguments
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    var j = proc.arrayArgs[i]
    vars.push(["t", j, "=array", j, ".dtype,",
               "r", j, "=array", j, ".order"].join(""))
    typesig.push("t" + j)
    typesig.push("r" + j)
    string_typesig.push("t"+j)
    string_typesig.push("r"+j+".join()")
    proc_args.push("array" + j + ".data")
    proc_args.push("array" + j + ".stride")
    proc_args.push("array" + j + ".offset|0")
    if (i>0) { // Gather conditions to check for shape equality (ignoring block indices)
      shapeLengthConditions.push("array" + proc.arrayArgs[0] + ".shape.length===array" + j + ".shape.length+" + (Math.abs(proc.arrayBlockIndices[0])-Math.abs(proc.arrayBlockIndices[i])))
      shapeConditions.push("array" + proc.arrayArgs[0] + ".shape[shapeIndex+" + Math.max(0,proc.arrayBlockIndices[0]) + "]===array" + j + ".shape[shapeIndex+" + Math.max(0,proc.arrayBlockIndices[i]) + "]")
    }
  }
  // Check for shape equality
  if (proc.arrayArgs.length > 1) {
    code.push("if (!(" + shapeLengthConditions.join(" && ") + ")) throw new Error('cwise: Arrays do not all have the same dimensionality!')")
    code.push("for(var shapeIndex=array" + proc.arrayArgs[0] + ".shape.length-" + Math.abs(proc.arrayBlockIndices[0]) + "; shapeIndex-->0;) {")
    code.push("if (!(" + shapeConditions.join(" && ") + ")) throw new Error('cwise: Arrays do not all have the same shape!')")
    code.push("}")
  }
  // Process scalar arguments
  for(var i=0; i<proc.scalarArgs.length; ++i) {
    proc_args.push("scalar" + proc.scalarArgs[i])
  }
  // Check for cached function (and if not present, generate it)
  vars.push(["type=[", string_typesig.join(","), "].join()"].join(""))
  vars.push("proc=CACHED[type]")
  code.push("var " + vars.join(","))
  
  code.push(["if(!proc){",
             "CACHED[type]=proc=compile([", typesig.join(","), "])}",
             "return proc(", proc_args.join(","), ")}"].join(""))

  if(proc.debug) {
    console.log("-----Generated thunk:\n" + code.join("\n") + "\n----------")
  }
  
  //Compile thunk
  var thunk = new Function("compile", code.join("\n"))
  return thunk(compile.bind(undefined, proc))
}

module.exports = createThunk

},function(module,exports,require){"use strict"

var uniq = require(7)

// This function generates very simple loops analogous to how you typically traverse arrays (the outermost loop corresponds to the slowest changing index, the innermost loop to the fastest changing index)
// TODO: If two arrays have the same strides (and offsets) there is potential for decreasing the number of "pointers" and related variables. The drawback is that the type signature would become more specific and that there would thus be less potential for caching, but it might still be worth it, especially when dealing with large numbers of arguments.
function innerFill(order, proc, body) {
  var dimension = order.length
    , nargs = proc.arrayArgs.length
    , has_index = proc.indexArgs.length>0
    , code = []
    , vars = []
    , idx=0, pidx=0, i, j
  for(i=0; i<dimension; ++i) { // Iteration variables
    vars.push(["i",i,"=0"].join(""))
  }
  //Compute scan deltas
  for(j=0; j<nargs; ++j) {
    for(i=0; i<dimension; ++i) {
      pidx = idx
      idx = order[i]
      if(i === 0) { // The innermost/fastest dimension's delta is simply its stride
        vars.push(["d",j,"s",i,"=t",j,"p",idx].join(""))
      } else { // For other dimensions the delta is basically the stride minus something which essentially "rewinds" the previous (more inner) dimension
        vars.push(["d",j,"s",i,"=(t",j,"p",idx,"-s",pidx,"*t",j,"p",pidx,")"].join(""))
      }
    }
  }
  if (vars.length > 0) {
    code.push("var " + vars.join(","))
  }  
  //Scan loop
  for(i=dimension-1; i>=0; --i) { // Start at largest stride and work your way inwards
    idx = order[i]
    code.push(["for(i",i,"=0;i",i,"<s",idx,";++i",i,"){"].join(""))
  }
  //Push body of inner loop
  code.push(body)
  //Advance scan pointers
  for(i=0; i<dimension; ++i) {
    pidx = idx
    idx = order[i]
    for(j=0; j<nargs; ++j) {
      code.push(["p",j,"+=d",j,"s",i].join(""))
    }
    if(has_index) {
      if(i > 0) {
        code.push(["index[",pidx,"]-=s",pidx].join(""))
      }
      code.push(["++index[",idx,"]"].join(""))
    }
    code.push("}")
  }
  return code.join("\n")
}

// Generate "outer" loops that loop over blocks of data, applying "inner" loops to the blocks by manipulating the local variables in such a way that the inner loop only "sees" the current block.
// TODO: If this is used, then the previous declaration (done by generateCwiseOp) of s* is essentially unnecessary.
//       I believe the s* are not used elsewhere (in particular, I don't think they're used in the pre/post parts and "shape" is defined independently), so it would be possible to make defining the s* dependent on what loop method is being used.
function outerFill(matched, order, proc, body) {
  var dimension = order.length
    , nargs = proc.arrayArgs.length
    , blockSize = proc.blockSize
    , has_index = proc.indexArgs.length > 0
    , code = []
  for(var i=0; i<nargs; ++i) {
    code.push(["var offset",i,"=p",i].join(""))
  }
  //Generate loops for unmatched dimensions
  // The order in which these dimensions are traversed is fairly arbitrary (from small stride to large stride, for the first argument)
  // TODO: It would be nice if the order in which these loops are placed would also be somehow "optimal" (at the very least we should check that it really doesn't hurt us if they're not).
  for(var i=matched; i<dimension; ++i) {
    code.push(["for(var j"+i+"=SS[", order[i], "]|0;j", i, ">0;){"].join("")) // Iterate back to front
    code.push(["if(j",i,"<",blockSize,"){"].join("")) // Either decrease j by blockSize (s = blockSize), or set it to zero (after setting s = j).
    code.push(["s",order[i],"=j",i].join(""))
    code.push(["j",i,"=0"].join(""))
    code.push(["}else{s",order[i],"=",blockSize].join(""))
    code.push(["j",i,"-=",blockSize,"}"].join(""))
    if(has_index) {
      code.push(["index[",order[i],"]=j",i].join(""))
    }
  }
  for(var i=0; i<nargs; ++i) {
    var indexStr = ["offset"+i]
    for(var j=matched; j<dimension; ++j) {
      indexStr.push(["j",j,"*t",i,"p",order[j]].join(""))
    }
    code.push(["p",i,"=(",indexStr.join("+"),")"].join(""))
  }
  code.push(innerFill(order, proc, body))
  for(var i=matched; i<dimension; ++i) {
    code.push("}")
  }
  return code.join("\n")
}

//Count the number of compatible inner orders
// This is the length of the longest common prefix of the arrays in orders.
// Each array in orders lists the dimensions of the correspond ndarray in order of increasing stride.
// This is thus the maximum number of dimensions that can be efficiently traversed by simple nested loops for all arrays.
function countMatches(orders) {
  var matched = 0, dimension = orders[0].length
  while(matched < dimension) {
    for(var j=1; j<orders.length; ++j) {
      if(orders[j][matched] !== orders[0][matched]) {
        return matched
      }
    }
    ++matched
  }
  return matched
}

//Processes a block according to the given data types
// Replaces variable names by different ones, either "local" ones (that are then ferried in and out of the given array) or ones matching the arguments that the function performing the ultimate loop will accept.
function processBlock(block, proc, dtypes) {
  var code = block.body
  var pre = []
  var post = []
  for(var i=0; i<block.args.length; ++i) {
    var carg = block.args[i]
    if(carg.count <= 0) {
      continue
    }
    var re = new RegExp(carg.name, "g")
    var ptrStr = ""
    var arrNum = proc.arrayArgs.indexOf(i)
    switch(proc.argTypes[i]) {
      case "offset":
        var offArgIndex = proc.offsetArgIndex.indexOf(i)
        var offArg = proc.offsetArgs[offArgIndex]
        arrNum = offArg.array
        ptrStr = "+q" + offArgIndex // Adds offset to the "pointer" in the array
      case "array":
        ptrStr = "p" + arrNum + ptrStr
        var localStr = "l" + i
        var arrStr = "a" + arrNum
        if (proc.arrayBlockIndices[arrNum] === 0) { // Argument to body is just a single value from this array
          if(carg.count === 1) { // Argument/array used only once(?)
            if(dtypes[arrNum] === "generic") {
              if(carg.lvalue) {
                pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join("")) // Is this necessary if the argument is ONLY used as an lvalue? (keep in mind that we can have a += something, so we would actually need to check carg.rvalue)
                code = code.replace(re, localStr)
                post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""))
              } else {
                code = code.replace(re, [arrStr, ".get(", ptrStr, ")"].join(""))
              }
            } else {
              code = code.replace(re, [arrStr, "[", ptrStr, "]"].join(""))
            }
          } else if(dtypes[arrNum] === "generic") {
            pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join("")) // TODO: Could we optimize by checking for carg.rvalue?
            code = code.replace(re, localStr)
            if(carg.lvalue) {
              post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""))
            }
          } else {
            pre.push(["var ", localStr, "=", arrStr, "[", ptrStr, "]"].join("")) // TODO: Could we optimize by checking for carg.rvalue?
            code = code.replace(re, localStr)
            if(carg.lvalue) {
              post.push([arrStr, "[", ptrStr, "]=", localStr].join(""))
            }
          }
        } else { // Argument to body is a "block"
          var reStrArr = [carg.name], ptrStrArr = [ptrStr]
          for(var j=0; j<Math.abs(proc.arrayBlockIndices[arrNum]); j++) {
            reStrArr.push("\\s*\\[([^\\]]+)\\]")
            ptrStrArr.push("$" + (j+1) + "*t" + arrNum + "b" + j) // Matched index times stride
          }
          re = new RegExp(reStrArr.join(""), "g")
          ptrStr = ptrStrArr.join("+")
          if(dtypes[arrNum] === "generic") {
            /*if(carg.lvalue) {
              pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join("")) // Is this necessary if the argument is ONLY used as an lvalue? (keep in mind that we can have a += something, so we would actually need to check carg.rvalue)
              code = code.replace(re, localStr)
              post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""))
            } else {
              code = code.replace(re, [arrStr, ".get(", ptrStr, ")"].join(""))
            }*/
            throw new Error("cwise: Generic arrays not supported in combination with blocks!")
          } else {
            // This does not produce any local variables, even if variables are used multiple times. It would be possible to do so, but it would complicate things quite a bit.
            code = code.replace(re, [arrStr, "[", ptrStr, "]"].join(""))
          }
        }
      break
      case "scalar":
        code = code.replace(re, "Y" + proc.scalarArgs.indexOf(i))
      break
      case "index":
        code = code.replace(re, "index")
      break
      case "shape":
        code = code.replace(re, "shape")
      break
    }
  }
  return [pre.join("\n"), code, post.join("\n")].join("\n").trim()
}

function typeSummary(dtypes) {
  var summary = new Array(dtypes.length)
  var allEqual = true
  for(var i=0; i<dtypes.length; ++i) {
    var t = dtypes[i]
    var digits = t.match(/\d+/)
    if(!digits) {
      digits = ""
    } else {
      digits = digits[0]
    }
    if(t.charAt(0) === 0) {
      summary[i] = "u" + t.charAt(1) + digits
    } else {
      summary[i] = t.charAt(0) + digits
    }
    if(i > 0) {
      allEqual = allEqual && summary[i] === summary[i-1]
    }
  }
  if(allEqual) {
    return summary[0]
  }
  return summary.join("")
}

//Generates a cwise operator
function generateCWiseOp(proc, typesig) {

  //Compute dimension
  // Arrays get put first in typesig, and there are two entries per array (dtype and order), so this gets the number of dimensions in the first array arg.
  var dimension = (typesig[1].length - Math.abs(proc.arrayBlockIndices[0]))|0
  var orders = new Array(proc.arrayArgs.length)
  var dtypes = new Array(proc.arrayArgs.length)
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    dtypes[i] = typesig[2*i]
    orders[i] = typesig[2*i+1]
  }
  
  //Determine where block and loop indices start and end
  var blockBegin = [], blockEnd = [] // These indices are exposed as blocks
  var loopBegin = [], loopEnd = [] // These indices are iterated over
  var loopOrders = [] // orders restricted to the loop indices
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    if (proc.arrayBlockIndices[i]<0) {
      loopBegin.push(0)
      loopEnd.push(dimension)
      blockBegin.push(dimension)
      blockEnd.push(dimension+proc.arrayBlockIndices[i])
    } else {
      loopBegin.push(proc.arrayBlockIndices[i]) // Non-negative
      loopEnd.push(proc.arrayBlockIndices[i]+dimension)
      blockBegin.push(0)
      blockEnd.push(proc.arrayBlockIndices[i])
    }
    var newOrder = []
    for(var j=0; j<orders[i].length; j++) {
      if (loopBegin[i]<=orders[i][j] && orders[i][j]<loopEnd[i]) {
        newOrder.push(orders[i][j]-loopBegin[i]) // If this is a loop index, put it in newOrder, subtracting loopBegin, to make sure that all loopOrders are using a common set of indices.
      }
    }
    loopOrders.push(newOrder)
  }

  //First create arguments for procedure
  var arglist = ["SS"] // SS is the overall shape over which we iterate
  var code = ["'use strict'"]
  var vars = []
  
  for(var j=0; j<dimension; ++j) {
    vars.push(["s", j, "=SS[", j, "]"].join("")) // The limits for each dimension.
  }
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    arglist.push("a"+i) // Actual data array
    arglist.push("t"+i) // Strides
    arglist.push("p"+i) // Offset in the array at which the data starts (also used for iterating over the data)
    
    for(var j=0; j<dimension; ++j) { // Unpack the strides into vars for looping
      vars.push(["t",i,"p",j,"=t",i,"[",loopBegin[i]+j,"]"].join(""))
    }
    
    for(var j=0; j<Math.abs(proc.arrayBlockIndices[i]); ++j) { // Unpack the strides into vars for block iteration
      vars.push(["t",i,"b",j,"=t",i,"[",blockBegin[i]+j,"]"].join(""))
    }
  }
  for(var i=0; i<proc.scalarArgs.length; ++i) {
    arglist.push("Y" + i)
  }
  if(proc.shapeArgs.length > 0) {
    vars.push("shape=SS.slice(0)") // Makes the shape over which we iterate available to the user defined functions (so you can use width/height for example)
  }
  if(proc.indexArgs.length > 0) {
    // Prepare an array to keep track of the (logical) indices, initialized to dimension zeroes.
    var zeros = new Array(dimension)
    for(var i=0; i<dimension; ++i) {
      zeros[i] = "0"
    }
    vars.push(["index=[", zeros.join(","), "]"].join(""))
  }
  for(var i=0; i<proc.offsetArgs.length; ++i) { // Offset arguments used for stencil operations
    var off_arg = proc.offsetArgs[i]
    var init_string = []
    for(var j=0; j<off_arg.offset.length; ++j) {
      if(off_arg.offset[j] === 0) {
        continue
      } else if(off_arg.offset[j] === 1) {
        init_string.push(["t", off_arg.array, "p", j].join(""))      
      } else {
        init_string.push([off_arg.offset[j], "*t", off_arg.array, "p", j].join(""))
      }
    }
    if(init_string.length === 0) {
      vars.push("q" + i + "=0")
    } else {
      vars.push(["q", i, "=", init_string.join("+")].join(""))
    }
  }

  //Prepare this variables
  var thisVars = uniq([].concat(proc.pre.thisVars)
                      .concat(proc.body.thisVars)
                      .concat(proc.post.thisVars))
  vars = vars.concat(thisVars)
  if (vars.length > 0) {
    code.push("var " + vars.join(","))
  }
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    code.push("p"+i+"|=0")
  }
  
  //Inline prelude
  if(proc.pre.body.length > 3) {
    code.push(processBlock(proc.pre, proc, dtypes))
  }

  //Process body
  var body = processBlock(proc.body, proc, dtypes)
  var matched = countMatches(loopOrders)
  if(matched < dimension) {
    code.push(outerFill(matched, loopOrders[0], proc, body)) // TODO: Rather than passing loopOrders[0], it might be interesting to look at passing an order that represents the majority of the arguments for example.
  } else {
    code.push(innerFill(loopOrders[0], proc, body))
  }

  //Inline epilog
  if(proc.post.body.length > 3) {
    code.push(processBlock(proc.post, proc, dtypes))
  }
  
  if(proc.debug) {
    console.log("-----Generated cwise routine for ", typesig, ":\n" + code.join("\n") + "\n----------")
  }
  
  var loopName = [(proc.funcName||"unnamed"), "_cwise_loop_", orders[0].join("s"),"m",matched,typeSummary(dtypes)].join("")
  var f = new Function(["function ",loopName,"(", arglist.join(","),"){", code.join("\n"),"} return ", loopName].join(""))
  return f()
}
module.exports = generateCWiseOp

},function(module,exports,require){"use strict"

function unique_pred(list, compare) {
  var ptr = 1
    , len = list.length
    , a=list[0], b=list[0]
  for(var i=1; i<len; ++i) {
    b = a
    a = list[i]
    if(compare(a, b)) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique_eq(list) {
  var ptr = 1
    , len = list.length
    , a=list[0], b = list[0]
  for(var i=1; i<len; ++i, b=a) {
    b = a
    a = list[i]
    if(a !== b) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique(list, compare, sorted) {
  if(list.length === 0) {
    return list
  }
  if(compare) {
    if(!sorted) {
      list.sort(compare)
    }
    return unique_pred(list, compare)
  }
  if(!sorted) {
    list.sort()
  }
  return unique_eq(list)
}

module.exports = unique

}],cache={};function req(i){if(cache[i])return cache[i].exports;const a=cache[i]={exports:{}};m[i](a,a.exports,req);return a.exports;}
(function(){const {InferenceSession, Tensor} = self.ort;
const ndarray=req(0);
const ops=req(3);







function preprocessDetection(image) {
  var rows = image.rows,
      cols = image.cols;

  var img_data = ndarray(new Float32Array(rows * cols * 3), [rows, cols, 3]);

  for (var y = 0; y < rows; y++)
    for (var x = 0; x < cols; x++) {
      let pixel = image.ucharPtr(y, x);
      for (var c = 0; c < 3; c++) {
        var pixel_value = 0
        if (c === 0) // R
          pixel_value = (pixel[c] - 127) / 128.0;
        if (c === 1) // G
          pixel_value = (pixel[c] - 127) / 128.0;
        if (c === 2) // B
          pixel_value = (pixel[c] - 127) / 128.0;

        img_data.set(y, x, c, pixel_value)
      }
    }

  var preprocesed = ndarray(new Float32Array(3 * rows * cols), [1, 3, rows, cols])

  // Transpose
  ops.assign(preprocesed.pick(0, 0, null, null), img_data.pick(null, null, 0));
  ops.assign(preprocesed.pick(0, 1, null, null), img_data.pick(null, null, 1));
  ops.assign(preprocesed.pick(0, 2, null, null), img_data.pick(null, null, 2));

  return preprocesed
}

async function detectFaceImage(session, img) {
  const onnx_config = {
        min_sizes: [[10, 16, 24], [32, 48], [64, 96], [128, 192, 256]],
        steps: [8, 16, 32, 64],
        variance: [0.1, 0.2],
        clip: false,
        confidence_threshold: 0.65,
        top_k: 750,
        nms_threshold: 0.4,
      };

  var dsize = new cv.Size(320, 240);
  var resize_image = new cv.Mat();
  cv.resize(img, resize_image, dsize);
  cv.cvtColor(resize_image, resize_image, cv.COLOR_BGR2RGB);

  const image = preprocessDetection(resize_image);

  var resize_param = {cols: img.cols / 320, rows: img.rows / 240};

  const input_tensor = new Tensor("float32", new Float32Array(320 * 240 * 3), [1, 3, 240, 320]);
  input_tensor.data.set(image.data);

  const feeds = {"input": input_tensor};
  const output_tensor = await session.run(feeds);

  const loc = output_tensor['boxes'];
  const conf = output_tensor['scores'];

  // const landmarks = output_tensor['585']
  const total_result = conf.size / 2;

  const scale = [320, 240, 320, 240];
  const scale1 = [800, 800, 800, 800, 800, 800, 800, 800, 800, 800];

  const priors = definePriorBox([320, 240], onnx_config);

  const boxes_arr = decodeBBox(loc, priors, onnx_config);

  const scores_arr = ndarray(conf.data, [total_result, 2]).pick(null, 1);
  var landms_arr = null;//decode_landmark(landmarks, priors, onnx_config.variance);

  var box = ndarray(loc.data, [4420, 4]);
  var boxes_before = scaleMultiplyBBox(box, scale);
  var landms_before = null;//scale_multiply_landms(landms_arr, scale1);

  var [bbox_screen, scores_screen, landms_screen] = screenScore(boxes_before, scores_arr, landms_before, onnx_config.confidence_threshold);

  var [bbox_sorted, scores_sorted, landms_sorted] = sortScore(bbox_screen, scores_screen, landms_screen, onnx_config.top_k);

  var [bbox_small, score_result, landms_small, result_size] = cpuNMS(bbox_sorted, scores_sorted, landms_sorted, onnx_config.nms_threshold);
  var [bbox_result, landms_result] = scaleResult(bbox_small, landms_small, resize_param, img.cols, img.rows);

  var output = {
    bbox: bbox_result,
    landmark: landms_result,
    conf: score_result,
    size: result_size
  }

  resize_image.delete();
  img.delete();
  return output
}

async function detectFace(session, canvas_id) {

  var img = cv.matFromImageData(canvas_id);
  var output = await detectFaceImage(session, img);

  return output
}



function product(x, y) {
  var size_x = x.length,
      size_y = y.length;
  var result = [];

  for (var i = 0; i < size_x; i++)
    for (var j = 0; j < size_y; j++)
      result.push([x[i], y[j]]);

  return result;
}

function range(num) {
  var result = [];
  for (var i = 0; i < num; i++)
    result.push(i);

  return result;
}

function definePriorBox(image_size, onnx_config) {
  var min_sizes = onnx_config.min_sizes,
      steps = onnx_config.steps,
      clip = onnx_config.clip,
      name = "s",
      feature_maps = steps.map((step) => [Math.ceil(image_size[0] / step), Math.ceil(image_size[1] / step)]);

  var anchors = [];

  feature_maps.forEach((f, k) => {
    var min_size = min_sizes[k];
    product(range(f[0]), range(f[1])).forEach(([i, j]) => {
      min_size.forEach((m_size) => {
        var s_kx = m_size / image_size[0],
            s_ky = m_size / image_size[1];
        var dense_cx = [j + 0.5].map((x) => x * steps[k] / image_size[0]),
            dense_cy = [i + 0.5].map((y) => y * steps[k] / image_size[1]);
        product(dense_cy, dense_cx).forEach(([cy, cx]) => {
          anchors.push(cx);
          anchors.push(cy);
          anchors.push(s_kx);
          anchors.push(s_ky);
        })
      });
    });
  });

  var output = ndarray(new Float32Array(anchors), [anchors.length / 4, 4]);

  if (clip)
    output = ndarray.ops.min(1, ops.max(output, 0));

  return output;
}

function decodeBBox(bbox, priors, onnx_config) {
  var variances = onnx_config.variance
  var loc = ndarray(bbox.data, [4420, 4]);
  // console.log(bbox, priors);
  var before_prior = priors.hi(null, 2),
      after_prior = priors.lo(null, 2);

  var before_loc = loc.hi(null, 2),
      after_loc = loc.lo(null, 2);

  var before_result = ndarray(new Float32Array(before_loc.shape[0] * before_loc.shape[1]), [before_loc.shape[0], 2]);
  var before_temp = ndarray(new Float32Array(before_loc.shape[0] * before_loc.shape[1]), [before_loc.shape[0], 2]);
  var before_temp2 = ndarray(new Float32Array(before_loc.shape[0] * before_loc.shape[1]), [before_loc.shape[0], 2]);

  var after_result = ndarray(new Float32Array(before_loc.shape[0] * before_loc.shape[1]), [before_loc.shape[0], 2]);
  var after_temp = ndarray(new Float32Array(before_loc.shape[0] * before_loc.shape[1]), [before_loc.shape[0], 2]);
  var after_temp2 = ndarray(new Float32Array(before_loc.shape[0] * before_loc.shape[1]), [before_loc.shape[0], 2]);
  var after_temp3 = ndarray(new Float32Array(before_loc.shape[0] * before_loc.shape[1]), [before_loc.shape[0], 2]);
  var after_temp4 = ndarray(new Float32Array(before_loc.shape[0] * before_loc.shape[1]), [before_loc.shape[0], 2]);

  var boxes = ndarray(new Float32Array(before_loc.shape[0] * 4), [before_loc.shape[0], 4]);

  // Before
  ops.mul(before_temp, before_loc, after_prior);
  ops.muls(before_temp2, before_temp, variances[0]);
  ops.add(before_result, before_temp2, before_prior);

  // After
  ops.muls(after_temp, after_loc, variances[1]);
  ops.exp(after_temp2, after_temp);
  ops.mul(after_temp3, after_temp2, after_prior);

  for (var index = 0; index < 4; index++)
    ops.assign(after_result.pick(null, index), after_temp3.pick(null, index));

  ops.divs(after_temp4, after_temp3, -2);
  ops.addeq(before_result, after_temp4);

  ops.addeq(after_result, before_result);

  ops.assign(boxes.pick(null, 0), before_result.pick(null, 0));
  ops.assign(boxes.pick(null, 1), before_result.pick(null, 1));
  ops.assign(boxes.pick(null, 2), after_result.pick(null, 0));
  ops.assign(boxes.pick(null, 3), after_result.pick(null, 1));

  return boxes;
}

function scaleMultiplyBBox(boxes_arr, scale) {
  var total_result = boxes_arr.shape[0];
  var boxes_before = ndarray(new Float32Array(total_result * 4), [total_result, 4]);

  for (var index = 0; index < scale.length; index++) {
    let temp = boxes_arr.pick(null, index),
        before_result = ndarray(new Float32Array(total_result), [total_result]);
    ops.muls(before_result, temp, scale[index]);
    ops.assign(boxes_before.pick(null, index), before_result);
  }

  return boxes_before;
}

function scaleMultiplyLandmarks(landms_arr, scale1) {
  var total_result = landms_arr.shape[0];
  var landms_before = ndarray(new Float32Array(total_result * 10), [total_result, 10]);

  for (var index = 0; index < scale1.length; index++) {
    let temp = landms_arr.pick(null, index),
        before_landms_result = ndarray(new Float32Array(total_result), [total_result]);
    ops.muls(before_landms_result, temp, scale1[index]);
    ops.assign(landms_before.pick(null, index), before_landms_result);
  }

  return landms_before;
}

function screenScore(bbox, scores, landms, threshold) {
  var total_size = scores.shape[0];
  var index_arr = [];

  for (var index = 0; index < total_size; index++) {
    var score_temp = scores.get(index);

    if (score_temp >= threshold) {
      index_arr.push(index);
    }
  }

  var result_bbox = ndarray(new Float32Array(index_arr.length * 4), [index_arr.length, 4]);
  var result_scores = ndarray(new Float32Array(index_arr.length), [index_arr.length]);
  var result_landms = null;//ndarray(new Float32Array(index_arr.length * 10), [index_arr.length, 10]);

  index_arr.forEach((index, i) => {
    ops.assign(result_bbox.pick(i, null), bbox.pick(index, null));
    //ops.assign(result_landms.pick(i, null), landms.pick(index, null));
    ops.assign(result_scores.pick(i), scores.pick(index));
  });

  return [result_bbox, result_scores, result_landms];
}

function sortScore(bbox, scores, landms, top_k) {
  var total_size = scores.shape[0];
  var index_sort = new Array(total_size * 2);

  for (var index = 0; index < total_size; index++) {
    var temp = scores.get(index);
    index_sort[index] = [index, temp];
  }

  index_sort.sort((a, b) => {
    if (a[1] < b[1]) return 1;
    if (a[1] > b[1]) return -1;

    return 0;
  });

  var max_size = (total_size > top_k) ? top_k : total_size;

  var result_bbox = ndarray(new Float32Array(max_size * 4), [max_size, 4]);
  var result_scores = ndarray(new Float32Array(max_size), [max_size]);
  var result_landms = null;//ndarray(new Float32Array(max_size * 10), [max_size, 10]);

  for (var idx = 0; idx < max_size; idx++) {
    result_scores.set(idx, index_sort[idx][1]);
    ops.assign(result_bbox.pick(idx, null), bbox.pick(index_sort[idx][0], null));
    //ops.assign(result_landms.pick(idx, null), landms.pick(index_sort[idx][0], null));
  }

  return [result_bbox, result_scores, result_landms];
}

function cpuNMS(bbox, scores, landms, thresh) {
  var {max, min} = Math;
  var size = bbox.shape[0];
  var foundLocations = [];
  var pick = [];

  for (var i = 0; i < size; i++) {
    var x1 = bbox.get(i, 0),
        y1 = bbox.get(i, 1),
        x2 = bbox.get(i, 2),
        y2 = bbox.get(i, 3);

    var width = x2 - x1,
        height = y2 - y1;

    if (width > 0 && height > 0) {
      var area = width * height;
      foundLocations.push({x1, y1, x2, y2, width, height, area, index: i});
    }
  }

  foundLocations.sort((b1, b2) => {
    return b1.y2 - b2.y2;
  });

  while (foundLocations.length > 0) {
    var last = foundLocations[0] //[foundLocations.length - 1];
    var suppress = [last];
    pick.push(last.index) //foundLocations.length - 1);

    for (let i = 1; i < foundLocations.length; i++) {
      const box = foundLocations[i];
      const xx1 = max(box.x1, last.x1);
      const yy1 = max(box.y1, last.y1);
      const xx2 = min(box.x2, last.x2);
      const yy2 = min(box.y2, last.y2);
      const w = max(0, xx2 - xx1 + 1);
      const h = max(0, yy2 - yy1 + 1);
      const overlap = (w * h) / box.area;

      if (overlap >= thresh)
        suppress.push(foundLocations[i]);
    }

    foundLocations = foundLocations.filter((box) => {
      return !suppress.find((supp) => {
        return supp === box;
      })
    });
  }

  var result_bbox = ndarray(new Float32Array(pick.length * 4), [pick.length, 4]);
  var result_scores = ndarray(new Float32Array(pick.length), [pick.length]);
  var result_landms = null;//ndarray(new Float32Array(pick.length * 10), [pick.length, 10]);

  // console.log("Pick index: ", pick);

  pick.forEach((pick_index, i) => {
    ops.assign(result_bbox.pick(i, null), bbox.pick(pick_index, null));
    ops.assign(result_scores.pick(i), scores.pick(pick_index));
    //ops.assign(result_landms.pick(i, null), landms.pick(pick_index, null));
  });

  return [result_bbox, result_scores, result_landms, pick.length];
}

function scaleResult(bbox, landmark, resize_param, width, height) {
  var size = bbox.shape[0];
  var result_bbox = ndarray(new Float32Array(size * 4), [size, 4]);
  var result_landms = null;//ndarray(new Float32Array(size * 10), [size, 10]);

  for (let i = 0; i < size; i++) {
    let x1 = bbox.get(i, 0) * resize_param.cols,
        y1 = bbox.get(i, 1) * resize_param.rows,
        x2 = bbox.get(i, 2) * resize_param.cols,
        y2 = bbox.get(i, 3) * resize_param.rows;

    const f_size = (y2 - y1);
    const ct_x = (x1 + x2) / 2,
          ct_y = (y1 + y2) / 2;

    x1 = (ct_x - f_size / 2) < 0 ? 0 : (ct_x - f_size / 2);
    y1 = (ct_y - f_size / 2) < 0 ? 0 : (ct_y - f_size / 2);
    x2 = (ct_x + f_size / 2) > width - 1 ? width - 1 : (ct_x + f_size / 2);
    y2 = (ct_y + f_size / 2) > height - 1 ? height - 1 : (ct_y + f_size / 2);

    result_bbox.set(i, 0, x1);
    result_bbox.set(i, 1, y1);
    result_bbox.set(i, 2, x2);
    result_bbox.set(i, 3, y2);
  }

  /*
  for (var j = 0; j < 5; j++) {
    let x = landmark.pick(null, j * 2),
        y = landmark.pick(null, j * 2 + 1);

    ops.divseq(x, resize_param.cols);     // X
    ops.divseq(y, resize_param.rows);    // Y

    ops.assign(result_landms.pick(null, j * 2), x);
    ops.assign(result_landms.pick(null, j * 2 + 1), y);
  }
  */
  return [result_bbox, result_landms];
}

function getBestFace(bbox) {
  var face_count = bbox.shape[0],
      bbox_size = bbox.shape[1];

  var idx = -1, max_size = 0;
  for (let i = 0; i < face_count; i++) {
    var x1 = parseInt(bbox.data[i * bbox_size]),
        y1 = parseInt(bbox.data[i * bbox_size + 1]),
        x2 = parseInt(bbox.data[i * bbox_size + 2]),
        y2 = parseInt(bbox.data[i * bbox_size + 3]),
        width = Math.abs(x2 - x1),
        height = Math.abs(y2 - y1);
    if (width * height > max_size)
      idx = i;
  }
  return idx
}

Object.assign(FacePlugin, {detectFace});
})();
(function(){const {InferenceSession, Tensor} = self.ort;
const ndarray=req(0);
const ops=req(3);




function decodeLandmark(landmark, priors, variances) {

  var landms = ndarray(landmark.data, [26250, 10]);
  var before_prior = priors.hi(null, 2),
      after_prior = priors.lo(null, 2);
  var result = ndarray(new Float32Array(landms.shape[0] * landms.shape[1]), landms.shape);
  var priortemp = ndarray(new Float32Array(after_prior.shape[0] * 2), [after_prior.shape[0], 2]);
  var half_size = parseInt(Math.floor(landms.shape[1] / 2));

  ops.muls(priortemp, after_prior, variances[0]);

  for (var index = 0; index < half_size; index++) {
    let temp = ndarray(new Float32Array(landms.shape[0] * 2), [landms.shape[0], 2]);
    let temp2 = ndarray(new Float32Array(landms.shape[0] * 2), [landms.shape[0], 2]);
    let preslice = landms.hi(null, (index + 1) * 2).lo(null, index * 2);
    ops.mul(temp, preslice, priortemp);
    ops.add(temp2, temp, before_prior);
    ops.assign(result.pick(null, index * 2), temp2.pick(null, 0));
    ops.assign(result.pick(null, index * 2 + 1), temp2.pick(null, 1));
  }

  return result;
}

function alignLandmarkImage(image, bbox, scale_value) {
  var src_h = image.rows,
      src_w = image.cols;

  var x = bbox[0]
  var y = bbox[1]
  var box_w = bbox[2]
  var box_h = bbox[3]

  var scale = Math.min((src_h-1)/box_h, Math.min((src_w-1)/box_w, scale_value))

  var new_width = box_w * scale
  var new_height = box_h * scale
  var center_x = box_w/2+x,
      center_y = box_h/2+y

  var left_top_x = center_x-new_width/2
  var left_top_y = center_y-new_height/2
  var right_bottom_x = center_x+new_width/2
  var right_bottom_y = center_y+new_height/2

  if (left_top_x < 0) {
    right_bottom_x -= left_top_x
    left_top_x = 0
  }

  if (left_top_y < 0) {
    right_bottom_y -= left_top_y
    left_top_y = 0
  }

  if (right_bottom_x > src_w-1) {
    left_top_x -= right_bottom_x-src_w+1
    right_bottom_x = src_w-1
  }

  if (right_bottom_y > src_h-1) {
    left_top_y -= right_bottom_y-src_h+1
    right_bottom_y = src_h-1
  }
  var rect = new cv.Rect(Math.max(parseInt(left_top_x), 0), Math.max(parseInt(left_top_y), 0),
      Math.min(parseInt(right_bottom_x - left_top_x), src_w-1), Math.min(parseInt(right_bottom_y - left_top_y), src_h-1))

  var face_image = image.roi(rect)

  var dsize = new cv.Size(64, 64);
  var resize_image = new cv.Mat();
  cv.resize(face_image, resize_image, dsize);
  cv.cvtColor(resize_image, resize_image, cv.COLOR_BGR2GRAY)

  face_image.delete()
  return resize_image
}

function preprocessLandmark(img) {
  var cols = img.cols;
  var rows = img.rows;
  var channels = 1;

  var img_data = ndarray(new Float32Array(rows * cols * channels), [rows, cols, channels]);

  for (var y = 0; y < rows; y++)
    for (var x = 0; x < cols; x++) {
      let pixel = img.ucharPtr(y, x);
      for (var c = 0; c < channels; c++) {
        var pixel_value = pixel[c] / 256.0;
        img_data.set(y, x, c, pixel_value)
      }
    }

  var preprocesed = ndarray(new Float32Array(channels * cols * rows), [1, channels, rows, cols])
  ops.assign(preprocesed.pick(0, 0, null, null), img_data.pick(null, null, 0));

  return preprocesed;
}

async function predictLandmarkImage(session, img, bbox) {
  var face_size = bbox.shape[0];
  var bbox_size = bbox.shape[1];

  const landmarks = [];

  for (let i = 0; i < face_size; i++) {
     var x1 = parseInt(bbox.data[i * bbox_size]),
        y1 = parseInt(bbox.data[i * bbox_size + 1]),
        x2 = parseInt(bbox.data[i * bbox_size + 2]),
        y2 = parseInt(bbox.data[i * bbox_size + 3]),
        width = Math.abs(x2 - x1),
        height = Math.abs(y2 - y1);

    var face_img = alignLandmarkImage(img, [x1, y1, width, height], 1.0);
    // cv.imshow("live-temp", face_img);
    var input_image = preprocessLandmark(face_img);
    face_img.delete();
    const input_tensor = new Tensor("float32", new Float32Array(64 * 64), [1, 1, 64, 64]);

    input_tensor.data.set(input_image.data);

    const feeds = {"input": input_tensor};

    const output_tensor = await session.run(feeds);
    var landmark_arr = output_tensor['output'].data;

    for (let i = 0; i < landmark_arr.length; i++) {
      if (i % 2 === 0)
        landmark_arr[i] = parseInt(landmark_arr[i] * width + x1);
      else
        landmark_arr[i] = parseInt(landmark_arr[i] * height + y1);
    }
    landmarks.push(landmark_arr);
    // console.log("Landmark result: ", landmark_arr[0], landmark_arr[1], landmark_arr[74], landmark_arr[75], landmark_arr[76], landmark_arr[77]);
  }
  img.delete();
  return landmarks
}

async function predictLandmark(session, canvas_id, bbox) {

  var img = cv.matFromImageData(canvas_id);
  var landmarks = await predictLandmarkImage(session, img, bbox);

  return landmarks;
}



Object.assign(FacePlugin, {predictLandmark});
})();
(function(){const {InferenceSession, Tensor} = self.ort;
const ndarray=req(0);
const ops=req(3);

const REFERENCE_FACIAL_POINTS = [
    [38.29459953, 51.69630051],
    [73.53179932, 51.50139999],
    [56.02519989, 71.73660278],
    [41.54930115, 92.3655014],
    [70.72990036, 92.20410156]
]



function convert68pts5pts(landmark) {
    var left_eye_x = (landmark[74] + landmark[76] + landmark[80] + landmark[82]) / 4,
        left_eye_y = (landmark[75] + landmark[77] + landmark[81] + landmark[83]) / 4,

        right_eye_x = (landmark[86] + landmark[88] + landmark[92] + landmark[94]) / 4,
        right_eye_y = (landmark[87] + landmark[89] + landmark[93] + landmark[95]) / 4,

        nose_x = landmark[60], nose_y = landmark[61],

        left_mouse_x = (landmark[96] + landmark[120]) / 2,
        left_mouse_y = (landmark[97] + landmark[121]) / 2,

        right_mouse_x = (landmark[108] + landmark[128]) / 2,
        right_mouse_y = (landmark[109] + landmark[129]) / 2;
    return [[left_eye_x, left_eye_y], [right_eye_x, right_eye_y], [nose_x, nose_y], [left_mouse_x, left_mouse_y],
      [right_mouse_x, right_mouse_y]]
}

function getReferenceFacialPoints() {
  let ref5pts = REFERENCE_FACIAL_POINTS;

  return ref5pts;
}

function warpAndCropFace(src,
                       face_pts,
                       ref_pts=null,
                       crop_size=[112, 112]) {

  let srcTri = cv.matFromArray(3, 1, cv.CV_32FC2, [face_pts[0][0], face_pts[0][1], face_pts[1][0], face_pts[1][1],
    face_pts[2][0], face_pts[2][1]]);
  let dstTri = cv.matFromArray(3, 1, cv.CV_32FC2, [ref_pts[0][0], ref_pts[0][1], ref_pts[1][0], ref_pts[1][1],
    ref_pts[2][0], ref_pts[2][1]]);

  let tfm = cv.getAffineTransform(srcTri, dstTri);

  let dsize = new cv.Size(crop_size[0], crop_size[1]);
  let dst = new cv.Mat();
  cv.warpAffine(src, dst, tfm, dsize);
  srcTri.delete(); dstTri.delete(); tfm.delete();

  return dst;
}

function alignFeatureImage(image, landmark) {
  let facePoints = convert68pts5pts(landmark);
  let refPoints = getReferenceFacialPoints();
  let alignImg = warpAndCropFace(image, facePoints, refPoints);
  return alignImg;
}

function preprocessFeature(image) {
  var rows = image.rows,
      cols = image.cols;

  var img_data = ndarray(new Float32Array(rows * cols * 3), [rows, cols, 3]);

  for (var y = 0; y < rows; y++)
    for (var x = 0; x < cols; x++) {
      let pixel = image.ucharPtr(y, x);
      for (var c = 0; c < 3; c++) {
        var pixel_value = 0
        if (c === 0) // R
          pixel_value = (pixel[c] - 127) / 128.0;
        if (c === 1) // G
          pixel_value = (pixel[c] - 127) / 128.0;
        if (c === 2) // B
          pixel_value = (pixel[c] - 127) / 128.0;

        img_data.set(y, x, c, pixel_value)
      }
    }

  var preprocesed = ndarray(new Float32Array(3 * rows * cols), [1, 3, rows, cols])

  ops.assign(preprocesed.pick(0, 0, null, null), img_data.pick(null, null, 0));
  ops.assign(preprocesed.pick(0, 1, null, null), img_data.pick(null, null, 1));
  ops.assign(preprocesed.pick(0, 2, null, null), img_data.pick(null, null, 2));

  return preprocesed
}

async function extractFeatureImage(session, img, landmarks) {
  const result = [];
  for (let i = 0; i < landmarks.length; i++) {

    var face_img = alignFeatureImage(img, landmarks[i]);
    //cv.imshow("live-temp", face_img);
    var input_image = preprocessFeature(face_img);
    face_img.delete();

    const input_tensor = new Tensor("float32", new Float32Array(112 * 112 * 3), [1, 3, 112, 112]);
    input_tensor.data.set(input_image.data);
    const feeds = {"input": input_tensor};

    const output_tensor = await session.run(feeds);
    // console.log("Feature result: ", output_tensor);

    result.push(output_tensor);
  }
  img.delete();
  return result;
}

async function extractFeature(session, canvas_id, landmarks) {
  var img = cv.matFromImageData(canvas_id);

  var result = await extractFeatureImage(session, img, landmarks);
  return result;
}





Object.assign(FacePlugin, {extractFeature});
})();
(function(){const {InferenceSession, Tensor} = self.ort;
const ndarray=req(0);
const ops=req(3);
function softmax(a) { const m=Math.max(...a), e=Array.from(a,x=>Math.exp(x-m)), z=e.reduce((x,y)=>x+y,0); return e.map(x=>x/z); }



function alignLivenessImage(image, bbox, scale_value) {
  var src_h = image.rows,
      src_w = image.cols;

  var x = bbox[0]
  var y = bbox[1]
  var box_w = bbox[2]
  var box_h = bbox[3]

  var scale = Math.min((src_h-1)/box_h, Math.min((src_w-1)/box_w, scale_value))

  var new_width = box_w * scale
  var new_height = box_h * scale
  var center_x = box_w/2+x,
      center_y = box_h/2+y

  var left_top_x = center_x-new_width/2
  var left_top_y = center_y-new_height/2
  var right_bottom_x = center_x+new_width/2
  var right_bottom_y = center_y+new_height/2

  if (left_top_x < 0) {
    right_bottom_x -= left_top_x
    left_top_x = 0
  }

  if (left_top_y < 0) {
    right_bottom_y -= left_top_y
    left_top_y = 0
  }

  if (right_bottom_x > src_w-1) {
    left_top_x -= right_bottom_x-src_w+1
    right_bottom_x = src_w-1
  }

  if (right_bottom_y > src_h-1) {
    left_top_y -= right_bottom_y-src_h+1
    right_bottom_y = src_h-1
  }
  var rect = new cv.Rect(Math.max(parseInt(left_top_x), 0), Math.max(parseInt(left_top_y), 0),
      Math.min(parseInt(right_bottom_x - left_top_x), src_w-1), Math.min(parseInt(right_bottom_y - left_top_y), src_h-1))

  var face_image = image.roi(rect)

  var dsize = new cv.Size(128, 128);
  var resize_image = new cv.Mat();
  cv.resize(face_image, resize_image, dsize);

  face_image.delete()
  return resize_image
}

function preprocessLiveness(img) {
  var cols = img.cols;
  var rows = img.rows;
  var channels = 3;

  var img_data = ndarray(new Float32Array(rows * cols * channels), [rows, cols, channels]);

  for (var y = 0; y < rows; y++)
    for (var x = 0; x < cols; x++) {
      let pixel = img.ucharPtr(y, x);
      for (var c = 0; c < channels; c++) {
        var pixel_value = 0
        if (c === 0) // R
          pixel_value = pixel[c];
        if (c === 1) // G
          pixel_value = pixel[c];
        if (c === 2) // B
          pixel_value = pixel[c];

        img_data.set(y, x, c, pixel_value)
      }
    }

  var preprocesed = ndarray(new Float32Array(channels * cols * rows), [1, channels, rows, cols])
  ops.assign(preprocesed.pick(0, 0, null, null), img_data.pick(null, null, 0));
  ops.assign(preprocesed.pick(0, 1, null, null), img_data.pick(null, null, 1));
  ops.assign(preprocesed.pick(0, 2, null, null), img_data.pick(null, null, 2));

  return preprocesed
}

async function predictLiveness(session, canvas_id, bbox) {
  var img = cv.matFromImageData(canvas_id)

  var face_size = bbox.shape[0];
  var bbox_size = bbox.shape[1];

  const result = [];
  for (let i = 0; i < face_size; i++) {
    var x1 = parseInt(bbox.data[i * bbox_size]),
        y1 = parseInt(bbox.data[i * bbox_size + 1]),
        x2 = parseInt(bbox.data[i * bbox_size + 2]),
        y2 = parseInt(bbox.data[i * bbox_size + 3]),
        width = Math.abs(x2 - x1),
        height = Math.abs(y2 - y1);

    var face_img = alignLivenessImage(img, [x1, y1, width, height], 2.7);
    //cv.imshow("live-temp", face_img);
    var input_image = preprocessLiveness(face_img);
    face_img.delete();

    const input_tensor = new Tensor("float32", new Float32Array(128 * 128 * 3), [1, 3, 128, 128]);
    input_tensor.data.set(input_image.data);
    const feeds = {"input": input_tensor};

    const output_tensor = await session.run(feeds);
    const score_arr = softmax(output_tensor['output'].data);


    // Model output is 3 classes: [2D fake (photo/print), real, 3D fake/replay]. Upstream wrongly used index 0.
    result.push([x1, y1, x2, y2, score_arr[1], score_arr]);
  }
  img.delete();
  return result;

}



Object.assign(FacePlugin, {predictLiveness});

})();
})();