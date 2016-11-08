#!/usr/bin/env node

import execPromise from 'exec-promise'
import fs from 'fs'
import fuse from 'fuse-bindings'
import path from 'path'
import { forEach, map } from 'lodash'
import { fromCallback } from 'promise-toolbox'
import { RemoteHandlerLocal } from '@nraynaud/xo-fs'

import { Vhd } from './vhd'

const {
  S_IFDIR,
  S_IFREG,
  S_IRUSR,
  S_IXUSR
} = fs.constants

const mountVhd = (dir, vhd) => fromCallback(cb => {
  const operations = {
    init (cb) {
      cb(0)
    },
    statfs (path, cb) {
      cb(0, {})
    },
    readdir (path, cb) {
      if (path === '/') {
        cb(0, ['disk'])
      } else {
        cb(fuse.NOENT)
      }
    },
    getattr (path, cb) {
      const now = new Date()
      const { uid, gid } = fuse.context()

      if (path === '/') {
        cb(0, {
          atime: now,
          ctime: now,
          gid,
          mode: S_IFDIR | S_IRUSR | S_IXUSR,
          mtime: now,
          size: 100,
          uid
        })
      } else if (path === '/disk') {
        const diskSize = vhd.footer.currentSize.high * Math.pow(2, 32) + vhd.footer.currentSize.low
        cb(0, {
          atime: now,
          ctime: now,
          gid,
          mode: S_IFREG | S_IRUSR,
          mtime: now,
          nlink: 1,
          size: diskSize,
          uid
        })
      } else {
        cb(fuse.ENOENT)
      }
    },
    open (path, flags, cb) {
      cb(0, 42) // 42 is an fd
    },
    read (path, fd, buf, len, pos, cb) {
      const blockSizeBytes = vhd.sectorsPerBlock * 512
      const posInBlock = pos % blockSizeBytes
      const tableEntry = Math.floor(pos / blockSizeBytes)
      const blockAddress = vhd.header.maxTableEntries > tableEntry
        ? vhd.readAllocationTableEntry()
        : 0xFFFFFFFF
      if (blockAddress !== 0xFFFFFFFF) {
        var actualLen = Math.min(len, blockSizeBytes - posInBlock)
        vhd.readBlockData(blockAddress).then(function (block) {
          block.copy(buf, 0, posInBlock, posInBlock + actualLen)
          return cb(actualLen)
        }).catch(function (error) {
          console.error(error)
          cb(-1)
        })
      } else {
        buf.fill(0, 0, len)
        return cb(len)
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

        return cb.apply(this, arguments)
      })

      return fn.apply(this, args)
    }
  })

  fuse.mount(dir, operations, cb)
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
  await vhd.readBlockTable()

  await mountVhd(mountPoint, vhd)

  await new Promise(resolve => process.on('SIGINT', resolve))

  await fromCallback(cb => fuse.unmount(mountPoint))
})

