# xo-vhdmount [![Build Status](https://travis-ci.org/vatesfr/xo-vhdmount.png?branch=master)](https://travis-ci.org/vatesfr/xo-vhdmount)

> Expose [VHDs](https://en.wikipedia.org/wiki/VHD_(file_format)) as [block devices](https://en.wikipedia.org/wiki/Device_file#BLOCKDEV) via [Fuse](https://en.wikipedia.org/wiki/Filesystem_in_Userspace)

## Install

Installation of the [npm package](https://npmjs.org/package/xo-vhdmount):

```
> npm install --save xo-vhdmount
```

You may need to install Fuse on your system, see [this documentation](https://github.com/mafintosh/fuse-bindings#requirements).

## Usage

```
> node dist/index.js file.vhd
```

This will create a directory `mntPoint` and a file `mntPoint/disk` whose content is the VHD file raw content.

```
> fusermount  -uz mntPoint
```

Will unmount the file.

```
> sudo mmls -a mntPoint/disk
DOS Partition Table
Offset Sector: 0
Units are in 512-byte sectors

     Slot    Start        End          Length       Description
02:  00:00   0000002048   0008386559   0008384512   Linux (0x83)
```

Will identify the partitions present in the raw disk.

## Development

```
# Install dependencies
> npm install

# Run the tests
> npm test

# Continuously compile
> npm run dev

# Continuously run the tests
> npm run dev-test

# Build for production (automatically called by npm install)
> npm run build
```

## Contributions

Contributions are *very* welcomed, either on the documentation or on
the code.

You may:

- report any [issue](https://github.com/nraynaud/xo-vhdmount/issues)
  you've encountered;
- fork and create a pull request.

## License

AGPLv3.0 © [Vates SAS](https://vates.fr)
