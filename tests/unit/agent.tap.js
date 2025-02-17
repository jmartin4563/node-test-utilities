/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const sinon = require('sinon')
const tap = require('tap')
const TestAgent = require('../../lib/agent')
const testUtil = require('../../lib/util')

const shimmer = require(testUtil.getNewRelicLocation() + '/lib/shimmer')

require('../../lib/assert').extendTap(tap)

tap.afterEach(() => {
  if (TestAgent.instance) {
    TestAgent.instance.unload()
  }
})

tap.test('new TestAgent', (t) => {
  const helper = new TestAgent()

  // Check singleton-ness
  t.equal(helper, TestAgent.instance, 'should make instance available on class')
  t.throws(
    () => {
      return new TestAgent()
    },
    Error,
    'should enforce singleton nature of Agent'
  )

  t.equal(helper.agent._state, 'started', 'should default to `started` state')

  t.end()
})

tap.test('new TestAgent with false setState arg', (t) => {
  const helper = new TestAgent(null, false)
  t.equal(helper.agent._state, 'stopped', 'should be in initial `stopped` state')

  t.end()
})

tap.test('TestAgent.makeInstrumented', (t) => {
  const spy = sinon.spy(shimmer, 'bootstrapInstrumentation')

  t.teardown(() => {
    spy.restore()
  })

  const Module = require('module')
  const origLoad = Module._load

  const helper = TestAgent.makeInstrumented()
  t.type(helper, TestAgent, 'should construct a TestAgent')
  t.not(Module._load, origLoad, 'should patch module')
  t.ok(shimmer.debug, 'should enable debug mode')
  t.notOk(spy.callCount, 'should not called bootstrapInstrumentation')

  t.equal(helper.agent._state, 'started', 'should default to `started` state')
  t.end()
})

tap.test('TestAgent.makeInstrumented with false setState arg', (t) => {
  const helper = TestAgent.makeInstrumented(null, false)
  t.equal(helper.agent._state, 'stopped', 'should be in initial `stopped` state')

  t.end()
})

tap.test('TestAgent.makeInstrumented instrumentFull flag', (t) => {
  const spy = sinon.spy(shimmer, 'bootstrapInstrumentation')

  t.teardown(() => {
    spy.restore()
  })
  const helper = TestAgent.makeInstrumented(null, null, true)
  t.type(helper, TestAgent, 'should construct a TestAgent')

  t.equal(spy.callCount, 1, 'should call bootstrapInstrumentation once')
  t.end()
})

tap.test('TestAgent.makeFullyInstrumented', (t) => {
  const spy = sinon.spy(shimmer, 'bootstrapInstrumentation')

  t.teardown(() => {
    spy.restore()
  })

  const helper = TestAgent.makeFullyInstrumented()
  t.type(helper, TestAgent, 'should construct a TestAgent')
  t.equal(spy.callCount, 1, 'should call bootstrapInstrumentation once')
  t.end()
})

tap.test('TestAgent instance', (t) => {
  let helper = null

  t.beforeEach(() => {
    helper = new TestAgent()
  })

  t.afterEach(() => {
    if (TestAgent.instance === helper) {
      helper.unload()
    }
    helper = null
  })

  t.test('TestAgent#instrument', (t) => {
    const Module = require('module')
    const origLoad = Module._load

    helper.instrument()
    t.not(Module._load, origLoad, 'should patch module')
    t.ok(shimmer.debug, 'should enable debug mode')

    t.end()
  })

  t.test('TestAgent#unload', (t) => {
    const Module = require('module')
    const origLoad = Module._load

    helper.instrument()
    helper.unload()

    t.equal(Module._load, origLoad, 'should unpatch module')
    t.notOk(shimmer.debug, 'should disable debug mode')
    t.equal(TestAgent.instance, null, 'should clear the TestAgent instance')
    t.same(shimmer.registeredInstrumentations, {}, 'should clear registered instrumentation')

    t.end()
  })

  t.test('TestAgent#runInTransaction', (t) => {
    let invoked = false

    helper.runInTransaction((tx) => {
      invoked = true
      t.ok(tx, 'should provide a transaction')
      t.transaction(tx, 'should give transaction to function')
    })
    t.ok(invoked, 'should immediately invoke function')

    t.end()
  })

  t.test('TestAgent#getTransaction', (t) => {
    t.equal(helper.getTransaction(), null, 'should return null when outside tx')
    helper.runInTransaction((tx) => {
      t.equal(helper.getTransaction(), tx, 'should return current tx when in one')
    })

    t.end()
  })

  t.test('TestAgent#registerInstrumentation', (t) => {
    const spy = sinon.spy(shimmer, 'registerInstrumentation')
    t.teardown(() => {
      spy.restore()
    })
    const opts = {
      type: 'web-framework',
      moduleName: 'test',
      onRequire: () => {}
    }

    helper.registerInstrumentation(opts)
    t.equal(spy.args[0][0], opts, 'should call shimmer.registerInstrumentation')

    t.end()
  })

  t.test('TestAgent#getAgentApi', (t) => {
    const api = helper.getAgentApi()

    t.ok(api)
    t.equal(api.agent, helper.agent)

    t.end()
  })

  t.test('TestAgent#getContextManager', (t) => {
    const contextManager = helper.getContextManager()

    t.ok(contextManager)
    t.ok(contextManager.getContext)
    t.ok(contextManager.setContext)
    t.ok(contextManager.runInContext)

    t.end()
  })

  t.test('TestAgent#getShim', (t) => {
    TestAgent.instance.instrument(true)
    const koa = require('koa')
    const shim = helper.getShim(koa)

    t.ok(shim)
    t.equal(shim.agent, helper.agent)
    t.equal(shim.moduleName, 'koa')

    t.end()
  })

  t.test('TestAgent#getShim returns null when no shim for pkg', (t) => {
    function foo() {}
    const shim = helper.getShim(foo)
    t.notOk(shim)
    t.end()
  })

  t.autoend()
})
