/**
 * jSQL.xhrCache.js v0.1
 * A jSQL plugin that caches non-unique AJAX requests
 * @author Robert Parham
 * @website https://github.com/Pamblam/jSQL#jsql
 */;

window.jSQL.xhrCache = (function(callback){ 
	jSQL.load(function(){
		
		// attempt to override the entire xhr definition
		var xhrConstructor = XMLHttpRequest;
		XMLHttpRequest = function(){
			var self = this;
			self._xhr = new (Function.prototype.bind.apply(xhrConstructor, arguments)); 
			self.syncAll = function(doFuncts){
				if(undefined === doFuncts) doFuncts = false;
				for(var prop in self._xhr){
					if(!self._xhr.hasOwnProperty(prop)) continue;
					if(typeof self._xhr[prop] === "function"){
						if('dispatchEvent' == prop) return;
						if(doFuncts === true){
							(function(){
								self[prop] = function(){
									var ret = (new xhrConstructor)[prop].apply(self._xhr, arguments);
									self.syncAll();
									return ret;
								};
							})(prop);
						}
					}else self[prop] = self._xhr[prop];
				}
			}
			
			self.syncAll(true);
		};
		
		
		// Make sure there's a table available
		jSQL.createTable({
			jSQLCache: {
				id: {type: "int"},
				method: {type: "varchar"},
				url: {type: "varchar"},
				post_data: {type:"varchar"},
				post_data_type: {type: "varchar"},
				username: {type:"varchar"},
				password: {type:"varchar"},
				cached_time: {type:"date"},
				use_count: {type: "int"},
				response: {type:"json"}
			}
		}).ifNotExists().execute();
		
		// is array buffer view?
		// http://stackoverflow.com/a/21799845/1444609
		function isAbv(value) {
			return value && value.buffer instanceof ArrayBuffer && value.byteLength !== undefined;
		}

		// arraybufferview to string
		// untested, from:http://stackoverflow.com/a/11058858/1444609
		function ab2str(buf) {
			return String.fromCharCode.apply(null, new Uint16Array(buf));
		}

		XMLHttpRequest.prototype.oldSend = XMLHttpRequest.prototype.send;
		XMLHttpRequest.prototype.send = function(){ 
			var args = arguments;
			var self = this;
			self._POST_DATA = "";
			self._POST_DATA_TYPE = "";
			(function(cb){
				if(undefined !== args[0] && this._METHOD !== "GET"){
					if(isAbv(args[0])){
						self._POST_DATA_TYPE = "ABV";
						self._POST_DATA = ab2str(buf);
						cb();
					}else
					if(args[0] instanceof Blob){
						var reader = new window.FileReader();
						reader.readAsDataURL(args[0]); 
						reader.onloadend = function() {
							self._POST_DATA_TYPE = "BLB";
							self._POST_DATA = reader.result;
							cb();
						};
					}else
					if(args[0] instanceof FormData){
						var keys = [];
						var vals = {};
						for(let val of args[0].keys()){
							if(undefined === vals[val]) vals[val] = [];
							keys.push(val);
						}
						for(let val of args[0].values())
							vals[keys.shift()].push(val);
						self._POST_DATA_TYPE = "FRMD";
						self._POST_DATA = JSON.stringify(vals);
						cb();
					}else{
						self._POST_DATA_TYPE = "STR";
						self._POST_DATA = args[0]+"";
						cb();
					}
				}else cb();
			})(function(){

				// check for an existing equivelent call
				var query = jSQL.query("select * from jSQLCache where method = ? and"+
						" url = ? and post_data = ? and post_data_type = ? and username = ?"+
						" and password = ?");
				var params = [self._METHOD, self._URL, self._POST_DATA, self._POST_DATA_TYPE,
						self._USERNAME, self._PASSWORD];
				var results = query.execute(params).fetchAll("ASSOC");
				if(results.length){
					
					for(var p in results[0].response){
						self[p] = results[0].response[p];
					}
					
					setTimeout(function(){
						self.readyState = 4;
						self.status = 200;
						console.log("jSQL.xhrCache: Serving cached AJAX response");
						self.onreadystatechange();
					}, 50);
					
				}else{
					
					var rsc = self.onreadystatechange;
					self.onreadystatechange = function(){
						if (self._xhr.readyState == 4 && self._xhr.status == 200){ 
							// serialize the request as best we can
							var sreq = {};
							for(var p in self._xhr){
								if("function" !== typeof self._xhr[p])
									sreq[p] = self._xhr[p];
							}
							var id = jSQL.query("select * from jSQLCache").execute().fetchAll("ARRAY").length;
							query = jSQL.query("insert into jSQLCache values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
							query.execute([id, self._METHOD, self._URL, self._POST_DATA, self._POST_DATA_TYPE,
								self._USERNAME, self._PASSWORD, new Date(), 0, sreq]);
							jSQL.persist();
							console.log("jSQL.xhrCache: Caching AJAX response");
						}
						
						rsc.apply(self._xhr, arguments);
					}
					
					self._xhr.onreadystatechange = self.onreadystatechange;
					xhrConstructor.prototype.send.apply(self._xhr, args);
				}
				
			});
		};
		
		XMLHttpRequest.prototype.open = function(){
			this._METHOD = arguments[0].toUpperCase();
			this._URL = arguments[1];
			this._USERNAME = undefined === arguments[3] ? "" :arguments[3];
			this._PASSWORD = undefined === arguments[4] ? "" :arguments[4];
			xhrConstructor.prototype.open.apply(this._xhr, arguments);
		};
	});
	
	return {settings: []}; // what to put here? settings?
})();