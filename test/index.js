var test = require('tape')

function isObject(o) {
  return o && 'object' === typeof o
}

function isFunction (f) {
  return 'function' === typeof f
}

function is (t, actual, expected, path) {
  if(isFunction(expected))
    expected.call(actual, path.concat(k))
  else t.equal(expected, actual, 'expected '+path.join('.')+' to equal:'+actual)
}

function has (t, actual, expected, path) {
  path = path || []

  if(!(isObject(actual))) return is(t, actual, expected, path)

  if(!isObject(expected))
    return t.fail('expected object at path:'+path.join('.'))

  for(var k in expected)
    has(t, actual[k], expected[k], path.concat(k))
}

module.exports = function (events) {

var note = events.note

test('initialize, connect to new peer', function (t) {

  var state = events.initialize()

  state = events.connect(state, {id: 'alice'})
  state = events.peerClock(state, {id: 'alice', value: {}})

  has(t, state, {
    peers: {
      alice: { clock: {}, msgs: [], notes: {}, replicating: {} },
    }
  })

  state = events.clock(state, {})

  state = events.follow(state, {id: 'alice', value: true})

  t.deepEqual(state.follows, {alice: true})
  console.log(state.peers.alice)

  has(t, state.peers.alice, {
    clock: {},
    notes: { alice: note(0, true) },
    replicating: {alice: {rx: true}}
  }, ['state', 'peers', 'alice'])

  //lets say we send the note

  state = events.notes(state, {id: 'alice', value: {alice: note(2, true)}})
  has(t, state, {
    clock: {},
    follows: {alice: true},
    peers: {
      alice: {
        clock: {alice: 2},
        replicating: {
          alice: {
            rx: true, tx: true
          }
        }
      }
    }
  })

  var msg = {author: 'alice', sequence: 1, content: {}}
  state = events.receive(state, {id: 'alice', value:msg})

  has(t, state, {
    peers: {
      alice: {
        clock: {alice: 2},
        replicating: {
          alice: {
            rx: true, tx: true
          }
        }
      }
    },
    receive: [msg],
  })

  var msg = state.receive.shift()

  state = events.append(state, msg)

  console.log(state)

  has(t, state, {
    clock: {alice: 1}
  })

  var msg2 = {author: 'alice', sequence: 2, content: {}}
  state = events.receive(state, {id: 'alice', value:msg2})
  state = events.append(state, state.receive.shift())

  has(t, state, {
    clock: {alice: 2}
  })

  var msg3 = {author: 'alice', sequence: 3, content: {}}
  state = events.receive(state, {id: 'alice', value:msg3})
  state = events.append(state, state.receive.shift())

  has(t, state, {
    clock: {alice: 3}
  })

  t.end()

})

test('initialize, but append before peerClock loads', function (t) {

  var state = events.initialize()
  state = events.clock(state, {alice: 1, bob: 2})

  state = events.connect(state, {id: 'alice'})
  state = events.append(state, {author: 'bob', sequence: 3, content: {}})

  state = events.peerClock(state, {id: 'alice', value: {}})
  t.end()
})

test('connect to two peers, append message one send, one note', function (t) {

  var state = {
    clock: { alice: 1 },
    peers: {
      bob: {
        clock: { alice: 1 },
        msgs: [], retrive: [],
        replicating: {
          alice: {
            rx: true, tx: true, sent: 1, retrive: false
          }
        }
      },
      charles: {
        clock: {alice: 1},
        msgs: [], retrive: [],
        replicating: {
          alice: {
            rx: false, tx: false, sent: 1, retrive: false
          }
        }
      }
    }
  }

  var msg = {author: 'alice', sequence: 2, content: {}}
  state = events.append(state, msg)

  has(t, state, {
    clock: { alice: 2 },
    peers: {
      bob: {
        clock: { alice: 1 },
        msgs: [msg],
        retrive: [],
        replicating: {
          alice: {
            rx: true, tx: true, sent: 2, retrive: false
          }
        }
      },
      charles: {
        clock: { alice: 1 },
        notes: { alice: note(2, false) },
        retrive: [],
        replicating: {
          alice: {
            rx: false, tx: false, sent: 1
          }
        }
      }
    }
  })

  t.end()

})

test('reply to any clock they send, 1', function (t) {
  var state = {
    clock: { alice: 3, bob: 2, charles: 3 },
    follows: { alice: true, bob: true, charles: true, darlene: false },
    peers: {}
  }

  state = events.connect(state, {id: 'bob'})
  state = events.peerClock(state, {id: 'bob', value:{alice: 3, charles: 1}})
  t.deepEqual(state.peers.bob.notes, {bob: note(2, true), charles: note(3, true)})

  state = events.notes(state, {id: 'bob', value: {alice: note(3, true), darlene: note(4, true)}})

  //notes hasn't been sent, so this is merged with previous
  t.deepEqual(state.peers.bob.notes, {alice: note(3, false), bob: note(2, true), charles: note(3, true), darlene: note(-1, true)})

  t.end()
})

test('reply to any clock they send, 2', function (t) {
  var state = {
    clock: { alice: 3, bob: 2},
    follows: { alice: true, bob: true},
    peers: {}
  }

  state = events.connect(state, {id: 'bob'})
  state = events.peerClock(state, {id: 'bob', value:{alice: 3, charles: 1}})
  t.deepEqual(state.peers.bob.notes, {bob: note(2, true)})

  state = events.notes(state, {id: 'bob', value: {alice: note(3, true)}})

  //notes hasn't been sent, so this is merged with previous
  t.deepEqual(state.peers.bob.notes, {alice: note(3, false), bob: note(2, true)})

  state = events.follow(state, {id: 'charles',value: true})
  t.deepEqual(state.peers.bob.notes, {alice: note(3, false), bob: note(2, true), charles: note(0, true)})

  t.end()
})

test('append when not in TX mode', function (t) {
  var state = {
    clock: { alice: 3, bob: 2},
    follows: { alice: true, bob: true},
    peers: {}
  }
  state = events.connect(state, {id: 'bob'})
  state = events.peerClock(state, {id: 'bob', value:{alice: 3, charles: 1}})
  t.deepEqual(state.peers.bob.notes, {bob: note(2, true)})

  state = events.notes(state, {id: 'bob', value: {alice: note(3, false)}})
  var rep = state.peers.bob.replicating.alice
  t.equal(rep.tx, false)
  t.equal(rep.sent, 3)

  console.log(state.peers.bob.replicating)

  state = events.append(state, {author: 'alice', sequence: 4, content: {}})
  t.deepEqual(state.peers.bob.notes, {bob: note(2, true), alice: note(4, false)})
  var rep = state.peers.bob.replicating.alice
  t.equal(rep.tx, false)
  t.equal(rep.sent, 3)

  state = events.notes(state, {id: 'bob', value: {alice: note(3, true)}})
  t.deepEqual(state.peers.bob.retrive, ['alice'])

  t.end()
})

test('note when not in RX mode', function (t) {
  var state = {
    clock: { alice: 3, bob: 2},
    follows: { alice: true, bob: true},
    peers: {
      bob: {
        clock: {alice: 3, bob: 2},
        retrive: [],
        msgs: [],
        notes: null,
        replicating: {
          alice: {
            tx:false, rx: false, sent: 3
          }
        }
      }
    }
  }

  state = events.notes(state, {id: 'bob', value: {alice: note(5, false)}})
  var rep = state.peers.bob.replicating.alice
//  t.equal(rep.tx, true)
  t.equal(rep.rx, true)
  t.equal(rep.sent, 5)
  t.deepEqual(state.peers.bob.notes, {alice: note(3, true)})

  console.log(state.peers.bob.replicating)

//  state = events.append(state, {author: 'alice', sequence: 4, content: {}})
//  t.deepEqual(state.peers.bob.notes, {bob: note(2, true), alice: note(4, false)})
  t.end()

})

test('note when value is not integer', function (t) {
  var state = {
    clock: { alice: 3, bob: 2},
    follows: { alice: true, bob: true},
    peers: {}
  }

  state = events.connect(state, {id: 'bob'})
  state = events.peerClock(state, {id: 'bob', value:{}})

  t.deepEqual(state.peers.bob.clock, {})
  state = events.notes(state, {id: 'bob', value: {alice: true}})

  t.deepEqual(state.peers.bob.clock, {alice: -1})
  t.deepEqual(state.peers.bob.notes, {alice: note(3,true), bob: note(2, true)})

  t.end()
})

test('test sends empty clock if nothing needed', function (t) {
  var state = {
    clock: { alice: 3, bob: 2},
    follows: { alice: true, bob: true},
    peers: {}
  }

  state = events.connect(state, {id: 'bob'})
  state = events.peerClock(state, {id: 'bob', value:{alice: 3, bob: 2}})

  t.deepEqual(state.peers.bob.clock, {alice: 3, bob: 2})
  t.deepEqual(state.peers.bob.notes, {})

  //receive empty clock
  state = events.notes(state, {id: 'bob', value: {}})
  t.deepEqual(state.peers.bob.replicating, {})

  t.end()
})


test('connects in sync then another message', function (t) {
  var state = {
    clock: { alice: 3, bob: 2},
    follows: { alice: true, bob: true},
    peers: {}
  }

  state = events.connect(state, {id: 'bob'})
  state = events.peerClock(state, {id: 'bob', value:{alice: 3, bob: 2}})

  t.deepEqual(state.peers.bob.clock, {alice: 3, bob: 2})
  t.deepEqual(state.peers.bob.notes, {})

  //receive empty clock
  state = events.notes(state, {id: 'bob', value: {}})
  t.deepEqual(state.peers.bob.replicating, {})

  state = events.append(state, {author: 'alice', sequence: 4, content: {}})
  t.deepEqual(state.peers.bob.notes, {alice: note(4, false)})
  
  t.end()
})

test('unfollow', function (t) {

  var state = {
    clock: { alice: 3, bob: 2},
    follows: {},
    peers: {}
  }

  state = events.connect(state, {id: 'bob'})
  state = events.peerClock(state, {id: 'bob', value:{}})

  t.deepEqual(state.peers.bob.clock, {})
  t.deepEqual(state.peers.bob.notes, { })
  state = events.notes(state, {id: 'bob', value:{alice: note(3, true), bob: note(2, true)}})
  t.deepEqual(state.peers.bob.notes, { alice: note(-1, true), bob: note(-1, true)})

  state.peers.bob.notes = null

  state = events.follow(state, {id: 'alice', value: false})

  t.deepEqual(state.peers.bob.notes, null)

  state = events.notes(state, {id: 'bob', value:{charles: note(-1, true)}})
  t.deepEqual(state.peers.bob.notes, {charles: note(-1, true)})
  state.peers.bob.notes = null
  state = events.notes(state, {id: 'bob', value:{charles: note(-1, true)}})
  t.deepEqual(state.peers.bob.notes, null)

  t.end()
})


test('remember clock of unfollow', function (t) {

  var state = {
    clock: { alice: 3, bob: 2},
    follows: {alice: true},
    peers: {}
  }

  state = events.connect(state, {id: 'bob'})
  state = events.peerClock(state, {id: 'bob', value:{alice: -1}})

  t.deepEqual(state.peers.bob.clock, {alice: -1})
  t.deepEqual(state.peers.bob.notes, {})

  t.end()
})


}

if(!module.parent)
  module.exports(require('./options'))


