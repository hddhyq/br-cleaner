import inquirer from 'inquirer'
import simpleGit from 'simple-git'
import type { SimpleGit } from 'simple-git'

const git: SimpleGit = simpleGit()

interface Branch {
  name: string
  value: string
  remote: boolean
}

async function getRemoteNames(): Promise<string[]> {
  const remotes = await git.getRemotes(true)
  return remotes.map(remote => remote.name)
}

async function getBranches(remoteName: string): Promise<Branch[]> {
  const branches = await git.branch(['-a'])
  const localBranches = branches.all.filter(branch => !branch.includes('remotes/'))
  const remoteBranches = branches.all.filter(branch => branch.includes(`remotes/${remoteName}/`))

  const uniqueBranches = localBranches.map((branch) => {
    const remoteBranch = remoteBranches.find(rb => rb.endsWith(branch))
    return {
      name: branch,
      value: branch,
      remote: !!remoteBranch,
    }
  })

  const onlyRemoteBranches = remoteBranches.filter(rb =>
    !localBranches.some(lb => rb.endsWith(lb)),
  ).map(branch => ({
    name: branch,
    value: branch,
    remote: true,
  }))

  return [...uniqueBranches, ...onlyRemoteBranches]
}

async function filterBranches(branches: Branch[]): Promise<Branch[]> {
  const { keyword } = await inquirer.prompt<{ keyword: string }>([{
    type: 'input',
    name: 'keyword',
    message: 'Enter keyword to filter branches:',
  }])

  return branches.filter(branch => branch.name.includes(keyword))
}

async function selectBranches(branches: Branch[]): Promise<string[]> {
  const { selectedBranches } = await inquirer.prompt<{ selectedBranches: string[] }>([{
    type: 'checkbox',
    name: 'selectedBranches',
    message: 'Select branches to delete:',
    choices: branches,
  }])

  return selectedBranches
}

async function deleteBranch(branch: string, remoteName: string): Promise<void> {
  try {
    if (branch.startsWith(`remotes/${remoteName}/`)) {
      const remoteBranch = branch.replace(`remotes/${remoteName}/`, '')
      await git.push([remoteName, '--delete', remoteBranch])
      // eslint-disable-next-line no-console
      console.log(`Deleted remote branch: ${branch}`)
    }
    else {
      await git.branch(['-d', branch])
      // eslint-disable-next-line no-console
      console.log(`Deleted local branch: ${branch}`)

      // Also delete the corresponding remote branch if it exists
      const remoteBranch = `remotes/${remoteName}/${branch}`
      const allBranches = await getBranches(remoteName)
      if (allBranches.some(branch => branch.name.includes(remoteBranch))) {
        await git.push([remoteName, '--delete', branch])
        // eslint-disable-next-line no-console
        console.log(`Deleted corresponding remote branch: ${remoteBranch}`)
      }
    }
  }
  catch (error: any) {
    console.error(`Failed to delete branch: ${branch}`, error.message)
  }
}

async function deleteBranches(branches: string[], remoteName: string): Promise<void> {
  for (const branch of branches) {
    await deleteBranch(branch, remoteName)
  }
}

async function main(): Promise<void> {
  try {
    const remoteNames = await getRemoteNames()
    let remoteName = 'origin'

    if (remoteNames.length > 1) {
      const { selectedRemote } = await inquirer.prompt<{ selectedRemote: string }>([{
        type: 'list',
        name: 'selectedRemote',
        message: 'Select the remote to use:',
        choices: remoteNames,
      }])
      remoteName = selectedRemote
    }

    // Fetch and prune before getting branches
    await git.fetch(remoteName, { '--prune': null })

    const allBranches = await getBranches(remoteName)
    const filteredBranches = await filterBranches(allBranches)
    const branchesToDelete = await selectBranches(filteredBranches)
    await deleteBranches(branchesToDelete, remoteName)
  }
  catch (error: any) {
    console.error('Error:', error.message)
  }
}

main()
