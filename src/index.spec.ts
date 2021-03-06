/* eslint-env jest */

import {
  format,
  JsonRpcParamsSchemaByPositional,
  JsonRpcPayload,
  JsonRpcPayloadRequest
} from 'json-rpc-protocol'

import {
  AnyFunction,
  MethodNotFound,
  Peer
} from './'

// ===================================================================

describe('Peer', () => {
  let server: Peer
  let client: Peer

  const messages: JsonRpcPayload[] = []

  beforeAll(() => {
    server = new Peer((message) => {
      messages.push(message)

      if (message.type === 'notification') {
        return
      }

      const { method } = message as JsonRpcPayloadRequest

      if (method === 'circular value') {
        const a: any[] = []
        a.push(a)

        return a
      }

      const requestPayload = message as JsonRpcPayloadRequest
      const params = requestPayload.params as any as JsonRpcParamsSchemaByPositional

      if (method === 'identity') {
        return params[0]
      }

      if (method === 'wait') {
        return new Promise((resolve) => {
          setTimeout(resolve, params[0])
        })
      }

      throw new MethodNotFound()
    })

    client = new Peer()

    server.pipe(client).pipe(server)
  })

  afterEach(() => {
    messages.length = 0
  })

  // =================================================================

  it('#notify()', () => {
    client.notify('foo')

    expect(messages.length).toBe(1)
    expect((messages[0] as any as JsonRpcPayloadRequest).method).toBe('foo')
    expect(messages[0].type).toBe('notification')
  })

  it('#request()', () => {
    const result = client.request('identity', [42])

    expect(messages.length).toBe(1)
    expect((messages[0] as any as JsonRpcPayloadRequest).method).toBe('identity')
    expect(messages[0].type).toBe('request')

    return result.then((ret) => {
      expect(ret).toBe(42)
    })
  })

  it('#request() injects method name when MethodNotFound', () => {
    return client.request('foo').then(
      () => {
        expect('should have been rejected').toBeFalsy()
      },
      (error) => {
        expect(error.code).toBe(-32601)
        expect(error.data).toBe('foo')
      }
    )
  })

  it('#request() in parallel', () => {
    const start = Date.now()

    return Promise.all([
      client.request('wait', [100]),
      client.request('wait', [100]),
      client.request('wait', [100])
    ]).then(() => {
      expect(Date.now() - start).toBeLessThan(200)
    })
  })

  describe('#write()', () => {
    it('emits an error event if the response message cannot be formatted', (done: AnyFunction) => {
      server.on('error', () => done())

      client.request('circular value')
      .catch(() => {
        // noop
      })
    })
  })

  describe('#exec()', () => {
    it('accepts an extra data parameter', () => {
      const data = {}
      const onMessage = jest.fn()
      const peer = new Peer(onMessage)
      peer.exec(format.notification('foo'), data)
      .catch(() => {
        // noop
      })
      expect(onMessage.mock.calls[0][1]).toBe(data)
    })
  })
})
