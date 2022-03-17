"use strict"

const _ = require('lodash');

class Serializer {
    // class properties
    static name = 'Serializer';

    // instance properties
    handlers    =  new Map();

    constructor (handlerDefs) {
        this.registerHandlers(handlerDefs);
    }

    registerHandlers (handlerDefs) {
        if (handlerDefs instanceof Map) {
            for (const [prototype, handlers] of handlerDefs.entries()) {
                const tempHandlers = {};

                if (
                        _.isFunction(prototype)
                    &&  _.isPlainObject(handlers)
                ) {
                    if (
                            _.has(handlers, 'keys')
                        &&  _.isFunction(handlers.keys)
                    ) {
                        tempHandlers.keys = handlers.keys;
                    }

                    if (
                            _.has(handlers, 'values')
                        &&  _.isFunction(handlers.values)
                    ) {
                        tempHandlers.values = handlers.values;
                    }

                    if (
                            _.has(tempHandlers, 'keys')
                        ||  _.has(tempHandlers, 'values')
                    ) {
                        this.handlers.set(prototype, tempHandlers);
                    }
                }
            }
        }
    }

    serialize (obj) {
        // get keys an object
        const getKeys = (obj) => {
            const constructorName = obj.constructor.name;
            let keys;

            // loop through registered handlers
            for (const [prototype, handlers] of this.handlers.entries()) {
                // if this handler matches object's prototype and has a keys handler...
                if (
                        obj instanceof prototype
                    &&  _.has(handlers, 'keys')
                ) {
                    // ...get the keys via the handler
                    keys = handlers.keys(obj);
                    // stop looping
                    break;
                }
            }

            // if we haven't yet determined any keys...
            if (!keys) {
                // ...handle classes as best we know
                // if object is a Map...
                if (_.isMap(obj)) {
                    // get array of keys
                    keys = Array.from(obj.keys());
                // if object is a Set...
                } else if (_.isSet(obj)) {
                    // ...get array of **values**
                    keys = Array.from(obj.values());
                } else if (_.isFunction(obj)) {
                    keys = null;
                // if object is any other kind of Object...
                } else if (typeof obj === 'object') {
                    // get array of keys
                    keys = Object.keys(obj);
                // otherwise...
                } else {
                    // ...no keys
                    keys = null;
                }
            }

            return keys;
        };

        const getValueForKey = (obj, key) => {
            let nextObj;

            // loop through registered handlers
            for (const [prototype, handlers] of this.handlers.entries()) {
                // if this handler matches object's prototype and has a keys handler...
                if (
                        obj instanceof prototype
                    &&  _.has(handlers, 'values')
                ) {
                    // ...get the keys via the handler
                    nextObj = handlers.values(obj);
                    // stop looping
                    break;
                }
            }

            // ...handle classes as best we know
            // if object is a Map...
            if (_.isMap(obj)) {
                // ...get the value for the key (via get method)
                nextObj = obj.get(key);
            // if object is a Set...
            } else if (_.isSet(obj)) {
                // ... value *is* the key
                nextObj = key;
            // otherwise...
            } else {
                // ...get the value for the key (generic object notation)
                nextObj = obj[key];
            }

            return nextObj;
        }

        const getValuesOfObj = (obj) => {
            if (_.isFunction(obj)) {
                return [obj.toString()];
            }
            return [obj];
        }

        // walk an object (could be a "key" because objects can be keys! (e.g.Maps))
        const walk = (obj) => {
            // set up seriaziled object
            const serialObj = {
                  type: undefined
                , keys: []
                , values: []
            };

            // if obj is undefined...
            if (obj === undefined) {
                // return serialized object as-is
                return serialObj;
            // otherwise, if obj is null...
            } else if (obj === null) {
                // ...change serialized object type to null
                serialObj.type = null
                // and return it
                return serialObj;
            }

            // set serialized object type to its constructor name
            serialObj.type = obj.constructor.name;

            // get keys for object at this level
            const keys = getKeys(obj);

            // if any keys were fonud...
            if (keys && keys.length > 0) {
                // ...loop through the keys
                for (const key of keys) {
                    // serialize the key (it may itself be an object, etc.)
                    serialObj.keys.push(walk(key));

                    // serialize value for current key
                    serialObj.values.push(walk(getValueForKey(obj, key)));
                }
            } else {
                serialObj.values = getValuesOfObj(obj);
            }

            return serialObj;
        };

        return walk(obj);
    }
}

class Deserializer {
    // class properties
    static name = 'Deserializer';

    // instance properties
    handlers    =  {
          'String'      : (values)          => values[0]
        , 'Number'      : (values)          => values[0]
        , 'Map'         : (values, keys)    => {
            const myMap = new Map();
            for (let i = 0, j = keys.length; i < j; i++) {
                myMap.set(keys[i], values[i]);
            }
            return myMap;
          }
        , 'Set'         : (values)          => {
            const mySet = new Set();
            for (let i = 0, j = values.length; i < j; i++) {
                mySet.add(values[i]);
            }
            return mySet;
          }
        , 'Function'    : (values)          => eval(values[0])
        , 'Object'      : (values, keys)    => {
            const myObject = {};
            for (let i = 0, j = keys.length; i < j; i++) {
                myObject[keys[i]] = values[i];
            }
            return myObject;
          }
        , 'undefined'   : ()                => undefined
        , 'null'        : ()                => null
    };

    constructor (handlerDefs) {
        this.registerHandlers(handlerDefs);
    }

    registerHandlers (handlerDefs) {
        if (_.isPlainObject(handlerDefs)) {
            for (const className in handlerDefs) {
                if (_.isFunction(handlerDefs[className])) {
                    this.handlers[className] = handlerDefs[className]
                }
            }
        }
    }

    deserialize (obj) {
        // get keys an object
        const reconstruct = (obj) => {
            // if a handler exists for this object's type...
            if (_.has(this.handlers, obj.type)) {
                // call the handler
                obj = this.handlers[obj.type](obj.values, obj.keys)
            } else {
                throw (`Don't know how to reconstruct object of type ${obj.type}`)
            }
            return obj;
        }

        // walk an object
        const walk = (obj) => {
            // set up deseriaziled object
            let deserialObj = _.cloneDeep(obj);
            // if obj is a plain object with the expected properties...
            if (
                    _.isPlainObject(deserialObj)
                &&  _.has(deserialObj, 'type')
                &&  _.has(deserialObj, 'keys')
                &&  _.has(deserialObj, 'values')
            ) {
                // loop through all the keys of deserialObj
                for (let i = 0, j = deserialObj.keys.length; i < j; i++) {
                    // walk the key
                    deserialObj.keys[i] = walk(deserialObj.keys[i]);
                }

                // loop through all the values of deserialObj
                for (let i = 0, j = deserialObj.values.length; i < j; i++) {
                    // walk the value
                    deserialObj.values[i] = walk(deserialObj.values[i]);
                }

                // reconstruct the object
                deserialObj = reconstruct(deserialObj)
            }

            return deserialObj;
        };

        // walk the supplied serialized object
        return walk(obj);
    }
}

module.exports = { Serializer, Deserializer };
