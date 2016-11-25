#!/usr/bin/env node

import execPromise from 'exec-promise'
import fuse from 'fuse-bindings'
import path from 'path'
import { fromCallback } from 'promise-toolbox'
import { RemoteHandlerLocal } from '@nraynaud/xo-fs'

import mountVhd from './'

process.on('unhandledRejection', error => {
  console.error(error)
})

execPromise(async args => {
  if (!args.length) {
    return `Usage: xo-vhdmount [-v] <VHD file> [<mount point>]`
  }

  let verbose = false
  if (args[0] === '-v') {
    args.shift()
    verbose = true
  }

  const [
    vhdFile,
    mountPoint = './vhd-mount'
  ] = args

  await mountVhd(
    mountPoint,
    new RemoteHandlerLocal({ url: `file:///` }),
    path.resolve(vhdFile),
    { verbose }
  )

  await new Promise(resolve => process.on('SIGINT', resolve))

  await fromCallback(cb => fuse.unmount(mountPoint, cb))
})

