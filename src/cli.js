#!/usr/bin/env node

import execPromise from 'exec-promise'
import path from 'path'
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

  const unmount = await mountVhd(
    mountPoint,
    new RemoteHandlerLocal({ url: `file:///` }),
    path.resolve(vhdFile),
    { verbose }
  )

  await new Promise(resolve => {
    process.on('SIGINT', () => {
      resolve()
    })

    process.on('uncaughtException', error => {
      console.error(error)
      resolve()
    })
  })

  await unmount()

  console.log('bye')
})

