import fs from 'fs'
import fuse from 'fuse-bindings'
import { forEach, get, isPlainObject, once } from 'lodash'
import { fromCallback } from 'promise-toolbox'

import Vhd from './vhd2'

const S_IFDIR = 1 << 14
const S_IFREG = 1 << 15
const S_IRUSR = 1 << 8
const S_IXUSR = 1 << 6

export default async (dir, remoteHandler, path, { verbose } = {}) => {
  await fromCallback(cb => fs.mkdir(dir, cb)).catch(error => {
    const code = error && error.code
    if (code !== 'EEXIST') {
      return fromCallback(cb => fs.stat(dir, cb)).then(stats => {
        if (!stats.isDirectory()) {
          throw error
        }
      })
    }
  })

  const vhd = new Vhd(remoteHandler, path)
  await vhd.readHeaderAndFooter()
  await vhd.readBlockAllocationTable()

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

  const operations = {
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
        let readen = 0 // old English but clearer than read
        const loop = () => entry.read(buf, pos + readen, len - readen, readen)
          .then(n => n && (readen += n) < len
            ? loop()
            : void cb(readen)
          )

        loop().catch(error => {
          console.error(error)
          cb(-1)
        })
      } else {
        cb(fuse.ENOENT)
      }
    },
    statfs (path, cb) {
      cb(0, {
        bsize: 512
      })
    }
  }

  const toString = vals => vals.map(val => Buffer.isBuffer(val)
    ? `Buffer(${val.length})`
    : JSON.stringify(val, null, 2)
  ).join(', ')
  forEach(operations, (fn, name) => {
    operations[name] = function (...args) {
      const i = args.length - 1
      const cb = args[i]

      if (verbose) {
        const timeout = setInterval(() => {
          console.error(
            '%s(%s) =?> [still running]',
            name,
            toString(args.slice(0, -1))
          )
        }, 1e3)

        args[i] = function (...results) {
          clearInterval(timeout)

          console.error(
            '%s(%s) %s (%s)',
            name,
            toString(args.slice(0, -1)),
            results[0] < 0 ? '=!>' : '==>',
            toString(results)
          )

          return cb.apply(this, results)
        }
      }

      try {
        return fn.apply(this, args)
      } catch (error) {
        console.error(name, error)
        cb(-1)
      }
    }
  })

  await fromCallback(cb => fuse.mount(dir, operations, cb))

  return once(() => fromCallback(cb => fuse.unmount(dir, cb)))
}
