#!/usr/bin/env node

import execPromise from 'exec-promise'
import fs from 'fs'
import fuse from 'fuse-bindings'
import path from 'path'
import { forEach, get, isPlainObject } from 'lodash'
import { fromCallback } from 'promise-toolbox'
import { RemoteHandlerLocal } from '@nraynaud/xo-fs'

import Vhd from './vhd2'

const {
  S_IFDIR,
  S_IFREG,
  S_IRUSR,
  S_IXUSR
} = fs.constants

const mountVhd = (dir, vhd) => fromCallback(cb => {
  const entries = {
    vhdi1: vhd
  }
  const getEntry = path => {
    if (path === '/') {
      return entries
    }

    return get(entries, path.split('/').slice(1))
  }
  const isDirectory = entry => isPlainObject(entry)
  const isFile = entry => entry && !isPlainObject(entry)

  let operations = {
    readdir (path, cb) {
      const entry = getEntry(path)
      if (isDirectory(entry)) {
        cb(0, Object.keys(entry))
      } else {
        cb(fuse.ENOENT)
      }
    },
    getattr (path, cb) {
      const entry = getEntry(path)
      if (!entry) {
        return cb(fuse.ENOENT)
      }

      const { gid, uid } = fuse.context()
      cb(0, Object.assign({
        gid,
        uid
      }, isDirectory(entry)
        ? {
          mode: S_IFDIR | S_IRUSR | S_IXUSR
        }
        : {
          mode: S_IFREG | S_IRUSR,
          size: entry.size
        }
      ))
    },
    open (path, flags, cb) {
      cb(0, 42) // 42 is an fd
    },
    read (path, fd, buf, len, pos, cb) {
      const entry = getEntry(path)
      if (isFile(entry)) {
        entry.read(buf, len, pos).then(len => {
          cb(len)
        })
      } else {
        return cb(fuse.ENOENT)
      }
    }
  }

  const toString = vals => vals.map(val => Buffer.isBuffer(val)
    ? `Buffer(${val.length})`
    : JSON.stringify(val, null, 2)
  ).join(', ')
  forEach(operations, (fn, name) => {
    operations[name] = function (...args) {
      const cb = args.pop()
      args.push(function (...results) {
        console.error(
          '%s(%s) %s (%s)',
          name,
          toString(args.slice(0, -1)),
          results[0] < 0 ? '=!>' : '==>',
          toString(results)
        )

        return cb.apply(this, results)
      })

      return fn.apply(this, args)
    }
  })

  fuse.mount(dir, operations, cb)
})

process.on('unhandledRejection', error => {
  console.error(error)
})

execPromise(async args => {
  if (!args.length) {
    return `Usage: xo-vhdmount <VHD file> [<mount point>]`
  }

  const [
    vhdFile,
    mountPoint = './vhd-mount'
  ] = args

  const vhd = new Vhd(
    new RemoteHandlerLocal({ url: `file:///` }),
    path.resolve(vhdFile)
  )

  await fromCallback(cb => fs.mkdir(mountPoint, cb)).catch(error => {
    if (error && error.code !== 'EEXIST') {
      throw error
    }
  })

  await vhd.readHeaderAndFooter()
  await vhd.readBlockAllocationTable()

  await mountVhd(mountPoint, vhd)

  await new Promise(resolve => process.on('SIGINT', resolve))

  await fromCallback(cb => fuse.unmount(mountPoint))
})

