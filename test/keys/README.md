# Dev keys — INSECURE

The private keys here are public and must never sign anything real (Q-04). Under kernel version `0` they sign `std` and the stores of tests: `dev-owner` is the key of a `human` owner, `dev-land` the key of the `machine` participant `land`. Each is an unencrypted OpenSSH file as `ssh-keygen -t ed25519 -N ""` writes it, with its `.pub` beside it. The real key of the owner arrives with SW.
