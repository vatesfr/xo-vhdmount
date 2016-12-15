import defer from 'golike-defer'
import execa from 'execa'
import execPromise from 'exec-promise'
import inquirer from 'inquirer'
import parsePairs from 'parse-pairs'
import path from 'path'
import splitLines from 'split-lines'
import tmp from 'tmp'
import { fromCallback } from 'promise-toolbox'
import { map, once } from 'lodash'
import { readdir } from 'fs'
import { RemoteHandlerLocal } from '@nraynaud/xo-fs'

import mountVhd from './'

// -------------------------------------------------------------------

const tmpDir = () => fromCallback(cb => tmp.dir(cb))

const prompt = question => inquirer.prompt([{
  ...question,
  name: 'default'
}]).then(answers => answers.default)

// -------------------------------------------------------------------

const listPartitions = device =>
  execa('partx', [
    '--bytes',
    '--output=NR,START,SIZE,NAME,UUID,TYPE',
    '--pairs',
    device
  ])
    .then(result => map(splitLines(result.stdout), parsePairs))

const mountPartition = async (dir, device, partition) => {
  await execa('mount', [
    //'--types=ext4',
    `--options=loop,offset=${partition.START * 512},ro,noload`,
    `--source=${device}`,
    `--target=${dir}`
  ])

  return once(() => execa('umount', [ dir ]))
}

const listFiles = dir => fromCallback(cb => readdir(dir, cb))

// -------------------------------------------------------------------

process.on('unhandledRejection', error => {
  console.error(error)
})

execPromise(defer(async ($defer, args) => {
  const [ vhdFile ] = args

  const vhdMountPoint = await tmpDir()
  $defer(await mountVhd(
    vhdMountPoint,
    new RemoteHandlerLocal({ url: `file:///` }),
    path.resolve(vhdFile)
  ))

  const device = `${vhdMountPoint}/vhdi1`

  const partitions = await listPartitions(device)
  const partition = await prompt({
    type: 'list',
    message: 'Which partition do you want to mount?',
    choices: map(partitions, (p, i) => ({
      name: `#${p.NR} ${p.UUID} (${p.SIZE})`,
      value: p
    }))
  })

  const partitionMountPoint = await tmpDir()
  $defer(await mountPartition(partitionMountPoint, device, partition))

  console.log(await listFiles(partitionMountPoint))
}))
