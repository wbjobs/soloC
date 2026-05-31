package ebpf

import (
	"fmt"
	"strings"
)

type ArgInfo struct {
	Name     string
	Type     string
	RawValue uint64
	Decoded  string
}

type DecodedArgs struct {
	Args      []ArgInfo
	Ret       int64
	RetDecoded string
}

type syscallDef struct {
	Name    string
	ArgNames []string
	ArgTypes []string
	RetType  string
}

var syscallDefinitions = map[int32]syscallDef{
	0: {
		Name:     "read",
		ArgNames: []string{"fd", "buf", "count"},
		ArgTypes: []string{"fd", "ptr", "size_t"},
		RetType:  "ssize_t",
	},
	1: {
		Name:     "write",
		ArgNames: []string{"fd", "buf", "count"},
		ArgTypes: []string{"fd", "ptr", "size_t"},
		RetType:  "ssize_t",
	},
	2: {
		Name:     "open",
		ArgNames: []string{"filename", "flags", "mode"},
		ArgTypes: []string{"strptr", "flags", "mode_t"},
		RetType:  "fd",
	},
	3: {
		Name:     "close",
		ArgNames: []string{"fd"},
		ArgTypes: []string{"fd"},
		RetType:  "int",
	},
	56: {
		Name:     "clone",
		ArgNames: []string{"flags", "stack", "parent_tidptr", "child_tidptr", "tls"},
		ArgTypes: []string{"flags", "ptr", "ptr", "ptr", "ptr"},
		RetType:  "pid_t",
	},
	57: {
		Name:     "fork",
		ArgNames: []string{},
		ArgTypes: []string{},
		RetType:  "pid_t",
	},
	59: {
		Name:     "execve",
		ArgNames: []string{"filename", "argv", "envp"},
		ArgTypes: []string{"strptr", "ptr", "ptr"},
		RetType:  "int",
	},
	60: {
		Name:     "exit",
		ArgNames: []string{"error_code"},
		ArgTypes: []string{"int"},
		RetType:  "noreturn",
	},
	41: {
		Name:     "socket",
		ArgNames: []string{"domain", "type", "protocol"},
		ArgTypes: []string{"int", "int", "int"},
		RetType:  "fd",
	},
	42: {
		Name:     "connect",
		ArgNames: []string{"fd", "addr", "addrlen"},
		ArgTypes: []string{"fd", "ptr", "socklen_t"},
		RetType:  "int",
	},
	43: {
		Name:     "accept",
		ArgNames: []string{"fd", "addr", "addrlen"},
		ArgTypes: []string{"fd", "ptr", "ptr"},
		RetType:  "fd",
	},
	44: {
		Name:     "sendto",
		ArgNames: []string{"fd", "buf", "len", "flags", "addr", "addrlen"},
		ArgTypes: []string{"fd", "ptr", "size_t", "int", "ptr", "socklen_t"},
		RetType:  "ssize_t",
	},
	45: {
		Name:     "recvfrom",
		ArgNames: []string{"fd", "buf", "len", "flags", "addr", "addrlen"},
		ArgTypes: []string{"fd", "ptr", "size_t", "int", "ptr", "ptr"},
		RetType:  "ssize_t",
	},
	16: {
		Name:     "ioctl",
		ArgNames: []string{"fd", "cmd", "arg"},
		ArgTypes: []string{"fd", "ioctl_cmd", "ptr"},
		RetType:  "int",
	},
	257: {
		Name:     "openat",
		ArgNames: []string{"dirfd", "pathname", "flags", "mode"},
		ArgTypes: []string{"fd", "strptr", "flags", "mode_t"},
		RetType:  "fd",
	},
	78: {
		Name:     "getdents",
		ArgNames: []string{"fd", "dirp", "count"},
		ArgTypes: []string{"fd", "ptr", "unsigned int"},
		RetType:  "int",
	},
	217: {
		Name:     "getdents64",
		ArgNames: []string{"fd", "dirp", "count"},
		ArgTypes: []string{"fd", "ptr", "unsigned int"},
		RetType:  "int",
	},
	9: {
		Name:     "mmap",
		ArgNames: []string{"addr", "length", "prot", "flags", "fd", "offset"},
		ArgTypes: []string{"ptr", "size_t", "prot", "flags", "fd", "off_t"},
		RetType:  "ptr",
	},
	11: {
		Name:     "munmap",
		ArgNames: []string{"addr", "length"},
		ArgTypes: []string{"ptr", "size_t"},
		RetType:  "int",
	},
	231: {
		Name:     "exit_group",
		ArgNames: []string{"error_code"},
		ArgTypes: []string{"int"},
		RetType:  "noreturn",
	},
	202: {
		Name:     "futex",
		ArgNames: []string{"uaddr", "op", "val", "timeout", "uaddr2", "val3"},
		ArgTypes: []string{"ptr", "futex_op", "int", "ptr", "ptr", "int"},
		RetType:  "int",
	},
	72: {
		Name:     "fcntl",
		ArgNames: []string{"fd", "cmd", "arg"},
		ArgTypes: []string{"fd", "fcntl_cmd", "long"},
		RetType:  "long",
	},
	82: {
		Name:     "rename",
		ArgNames: []string{"oldpath", "newpath"},
		ArgTypes: []string{"strptr", "strptr"},
		RetType:  "int",
	},
	83: {
		Name:     "mkdir",
		ArgNames: []string{"pathname", "mode"},
		ArgTypes: []string{"strptr", "mode_t"},
		RetType:  "int",
	},
	84: {
		Name:     "rmdir",
		ArgNames: []string{"pathname"},
		ArgTypes: []string{"strptr"},
		RetType:  "int",
	},
	87: {
		Name:     "unlink",
		ArgNames: []string{"pathname"},
		ArgTypes: []string{"strptr"},
		RetType:  "int",
	},
	21: {
		Name:     "access",
		ArgNames: []string{"pathname", "mode"},
		ArgTypes: []string{"strptr", "int"},
		RetType:  "int",
	},
	307: {
		Name:     "bpf",
		ArgNames: []string{"cmd", "attr", "size"},
		ArgTypes: []string{"bpf_cmd", "ptr", "unsigned int"},
		RetType:  "int",
	},
	293: {
		Name:     "inotify_add_watch",
		ArgNames: []string{"fd", "pathname", "mask"},
		ArgTypes: []string{"fd", "strptr", "uint32_t"},
		RetType:  "int",
	},
	280: {
		Name:     "inotify_init1",
		ArgNames: []string{"flags"},
		ArgTypes: []string{"int"},
		RetType:  "fd",
	},
}

func decodeArg(argType string, value uint64) string {
	switch argType {
	case "fd":
		if value == 0 {
			return "stdin"
		} else if value == 1 {
			return "stdout"
		} else if value == 2 {
			return "stderr"
		}
		return fmt.Sprintf("fd=%d", value)
	case "pid_t":
		return fmt.Sprintf("pid=%d", int64(value))
	case "ptr", "strptr":
		if value == 0 {
			return "NULL"
		}
		return fmt.Sprintf("0x%x", value)
	case "int", "long", "unsigned int":
		return fmt.Sprintf("%d", int64(value))
	case "size_t", "unsigned long":
		return fmt.Sprintf("%lu", value)
	case "mode_t":
		return fmt.Sprintf("0o%o", value&0777)
	case "flags":
		return decodeOpenFlags(value)
	case "prot":
		return decodeProt(value)
	case "socklen_t":
		return fmt.Sprintf("%d", value)
	case "ioctl_cmd":
		return fmt.Sprintf("0x%x", value)
	case "futex_op":
		return decodeFutexOp(value)
	case "fcntl_cmd":
		return decodeFcntlCmd(value)
	case "bpf_cmd":
		return decodeBpfCmd(value)
	case "noreturn":
		return "noreturn"
	case "ssize_t":
		if int64(value) < 0 {
			return fmt.Sprintf("error=%d", int64(value))
		}
		return fmt.Sprintf("%d bytes", int64(value))
	case "off_t":
		return fmt.Sprintf("%d", int64(value))
	default:
		return fmt.Sprintf("0x%x", value)
	}
}

func decodeOpenFlags(flags uint64) string {
	var parts []string
	if flags&00000001 != 0 {
		parts = append(parts, "O_WRONLY")
	} else if flags&00000002 != 0 {
		parts = append(parts, "O_RDWR")
	} else {
		parts = append(parts, "O_RDONLY")
	}
	if flags&00000100 != 0 {
		parts = append(parts, "O_CREAT")
	}
	if flags&00000200 != 0 {
		parts = append(parts, "O_EXCL")
	}
	if flags&00001000 != 0 {
		parts = append(parts, "O_TRUNC")
	}
	if flags&00002000 != 0 {
		parts = append(parts, "O_APPEND")
	}
	if flags&00004000 != 0 {
		parts = append(parts, "O_NONBLOCK")
	}
	if flags&00200000 != 0 {
		parts = append(parts, "O_CLOEXEC")
	}
	if len(parts) == 0 {
		return fmt.Sprintf("0x%x", flags)
	}
	return strings.Join(parts, "|")
}

func decodeProt(prot uint64) string {
	var parts []string
	if prot&0x1 != 0 {
		parts = append(parts, "PROT_READ")
	}
	if prot&0x2 != 0 {
		parts = append(parts, "PROT_WRITE")
	}
	if prot&0x4 != 0 {
		parts = append(parts, "PROT_EXEC")
	}
	if prot&0x8 != 0 {
		parts = append(parts, "PROT_SEM")
	}
	if len(parts) == 0 {
		return fmt.Sprintf("0x%x", prot)
	}
	return strings.Join(parts, "|")
}

func decodeFutexOp(op uint64) string {
	op &= 0x7f
	switch op {
	case 0:
		return "FUTEX_WAIT"
	case 1:
		return "FUTEX_WAKE"
	case 2:
		return "FUTEX_FD"
	case 3:
		return "FUTEX_REQUEUE"
	case 4:
		return "FUTEX_CMP_REQUEUE"
	case 5:
		return "FUTEX_WAKE_OP"
	case 6:
		return "FUTEX_LOCK_PI"
	case 7:
		return "FUTEX_UNLOCK_PI"
	case 8:
		return "FUTEX_TRYLOCK_PI"
	case 9:
		return "FUTEX_WAIT_BITSET"
	case 10:
		return "FUTEX_WAKE_BITSET"
	case 11:
		return "FUTEX_WAIT_REQUEUE_PI"
	case 12:
		return "FUTEX_CMP_REQUEUE_PI"
	default:
		return fmt.Sprintf("FUTEX_UNKNOWN(%d)", op)
	}
}

func decodeFcntlCmd(cmd uint64) string {
	switch cmd {
	case 0:
		return "F_DUPFD"
	case 1:
		return "F_GETFD"
	case 2:
		return "F_SETFD"
	case 3:
		return "F_GETFL"
	case 4:
		return "F_SETFL"
	case 5:
		return "F_GETLK"
	case 6:
		return "F_SETLK"
	case 7:
		return "F_SETLKW"
	case 12:
		return "F_SETPIPE_SZ"
	case 13:
		return "F_GETPIPE_SZ"
	default:
		return fmt.Sprintf("FCNTL_CMD(%d)", cmd)
	}
}

func decodeBpfCmd(cmd uint64) string {
	switch cmd {
	case 0:
		return "BPF_MAP_CREATE"
	case 1:
		return "BPF_MAP_LOOKUP_ELEM"
	case 2:
		return "BPF_MAP_UPDATE_ELEM"
	case 3:
		return "BPF_MAP_DELETE_ELEM"
	case 4:
		return "BPF_MAP_GET_NEXT_KEY"
	case 5:
		return "BPF_PROG_LOAD"
	case 6:
		return "BPF_OBJ_PIN"
	case 7:
		return "BPF_OBJ_GET"
	case 8:
		return "BPF_PROG_ATTACH"
	case 9:
		return "BPF_PROG_DETACH"
	default:
		return fmt.Sprintf("BPF_CMD(%d)", cmd)
	}
}

func decodeRet(syscallNr int32, ret int64) string {
	if syscallDef, ok := syscallDefinitions[syscallNr]; ok {
		switch syscallDef.RetType {
		case "fd":
			if ret >= 0 {
				return fmt.Sprintf("fd=%d", ret)
			}
			return fmt.Sprintf("error=%d", ret)
		case "pid_t":
			if ret >= 0 {
				return fmt.Sprintf("pid=%d", ret)
			}
			return fmt.Sprintf("error=%d", ret)
		case "ssize_t":
			if ret >= 0 {
				return fmt.Sprintf("%d bytes", ret)
			}
			return fmt.Sprintf("error=%d", ret)
		case "ptr":
			if ret != 0 {
				return fmt.Sprintf("0x%x", uint64(ret))
			}
			return "NULL"
		case "noreturn":
			return "process exited"
		default:
			if ret < 0 {
				return fmt.Sprintf("error=%d", ret)
			}
			return fmt.Sprintf("%d", ret)
		}
	}
	if ret < 0 {
		return fmt.Sprintf("error=%d", ret)
	}
	return fmt.Sprintf("%d", ret)
}

func DecodeArgs(syscallNr int32, args [6]uint64, ret int64) *DecodedArgs {
	result := &DecodedArgs{
		Args:       make([]ArgInfo, 0, 6),
		Ret:        ret,
		RetDecoded: decodeRet(syscallNr, ret),
	}

	if syscallDef, ok := syscallDefinitions[syscallNr]; ok {
		for i, name := range syscallDef.ArgNames {
			if i >= len(syscallDef.ArgTypes) {
				break
			}
			argType := syscallDef.ArgTypes[i]
			result.Args = append(result.Args, ArgInfo{
				Name:     name,
				Type:     argType,
				RawValue: args[i],
				Decoded:  decodeArg(argType, args[i]),
			})
		}
	} else {
		for i := 0; i < 6; i++ {
			if args[i] == 0 {
				continue
			}
			result.Args = append(result.Args, ArgInfo{
				Name:     fmt.Sprintf("arg%d", i),
				Type:     "unknown",
				RawValue: args[i],
				Decoded:  fmt.Sprintf("0x%x", args[i]),
			})
		}
	}

	return result
}

func FormatArgs(decoded *DecodedArgs) string {
	var parts []string
	for _, arg := range decoded.Args {
		parts = append(parts, fmt.Sprintf("%s=%s", arg.Name, arg.Decoded))
	}
	if len(parts) == 0 {
		return "()"
	}
	return fmt.Sprintf("(%s)", strings.Join(parts, ", "))
}

func FormatEvent(syscallName string, decoded *DecodedArgs) string {
	return fmt.Sprintf("%s%s -> %s", syscallName, FormatArgs(decoded), decoded.RetDecoded)
}
