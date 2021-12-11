import { useState, useEffect, Suspense, useRef, useLayoutEffect, ComponentType } from 'react'
import { Button, Stack, Box, IconButton } from '@chakra-ui/core'
import { Web3Provider } from '@ethersproject/providers'
import { useWeb3React } from '@web3-react/core'
import MetaMaskOnboarding from '@metamask/onboarding'
import { TokenAmount } from '@uniswap/sdk'

import { formatEtherscanLink, EtherscanType, shortenHex } from '../utils'
import { getNetwork, connectors } from '../connectors'
import { useETHBalance } from '../data'
import ErrorBoundary from './ErrorBoundary'
import { useQueryParameters, useUSDETHPrice } from '../hooks'
import { QueryParameters } from '../constants'
import { useShowUSD } from '../context'
import { WalletConnectConnector } from '@web3-react/walletconnect-connector'
import { Icons } from '@chakra-ui/core/dist/theme/icons'

function ETHBalance(): JSX.Element {
  const { account } = useWeb3React()
  const { data } = useETHBalance(account, true)

  const [showUSD] = useShowUSD()
  const USDETHPrice = useUSDETHPrice()

  return (
    <Button
      variant="outline"
      cursor="default"
      tabIndex={-1}
      _hover={{}}
      _active={{}}
      _focus={{}}
      style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }}
    >
      Ξ{' '}
      {showUSD && USDETHPrice
        ? `$${(data as TokenAmount).multiply(USDETHPrice).toFixed(2, { groupSeparator: ',' })}`
        : (data as TokenAmount).toSignificant(4, { groupSeparator: ',' })}
    </Button>
  )
}

export default function Account({ triedToEagerConnect }: { triedToEagerConnect: boolean }): JSX.Element | null {
  const { active, error, activate, library, chainId, account, setError, deactivate } = useWeb3React<Web3Provider>()
  console.log(`Account / active, error, library, chainId, account`, active, error, library, chainId, account)

  // initialize metamask onboarding
  const onboarding = useRef<MetaMaskOnboarding>()
  useLayoutEffect(() => {
    onboarding.current = new MetaMaskOnboarding()
  }, [])

  // automatically try connecting to the network connector where applicable
  const queryParameters = useQueryParameters()
  const requiredChainId = queryParameters[QueryParameters.CHAIN]
  useEffect(() => {
    if (triedToEagerConnect && !active && !error) {
      activate(getNetwork(requiredChainId))
    }
  }, [triedToEagerConnect, active, error, requiredChainId, activate])

  // manage connecting state for injected connector
  const [connecting, setConnecting] = useState(false)

  function createConnectHandler(connectorId: string) {
    return async () => {
      setConnecting(true)
      try {
        const connector = connectors[connectorId]

        // Taken from https://github.com/NoahZinsmeister/web3-react/issues/124#issuecomment-817631654
        if (connector instanceof WalletConnectConnector && connector.walletConnectProvider?.wc?.uri) {
          connector.walletConnectProvider = undefined
        }

        await activate(connector)
      } catch (error) {
        console.error(error)
      }
      setConnecting(false)
    }
  }

  // @todo implement
  function handleDisconnect() {
    try {
      deactivate()
    } catch (error) {
      console.error(error)
    }
    setConnecting(false)
  }

  function getConnectorDetails(
    connector: string | 'injected' | 'walletconnect' | 'uauth'
  ): { name: string; icon: Icons | ComponentType<Record<string, unknown>> | undefined } {
    switch (connector) {
      case 'injected':
        return {
          name: 'Metamask',
          icon: 'metamask' as 'edit',
        }
      case 'walletconnect':
        return {
          name: 'WalletConnect',
          icon: 'walletconnect' as 'edit',
        }
      case 'uauth':
        return {
          name: 'Unstoppable Domains',
          icon: 'unstoppabledomains' as 'edit',
        }

      default:
        return {
          name: 'Metamask',
          icon: 'metamask' as 'edit',
        }
    }
  }

  useEffect(() => {
    if (active || error) {
      setConnecting(false)
      onboarding.current?.stopOnboarding()
    }
  }, [active, error])

  const [ENSName, setENSName] = useState<string>('')
  useEffect(() => {
    if (library && account) {
      let stale = false
      library
        .lookupAddress(account)
        .then((name) => {
          if (!stale && typeof name === 'string') {
            setENSName(name)
          }
        })
        .catch(() => {}) // eslint-disable-line @typescript-eslint/no-empty-function
      return (): void => {
        stale = true
        setENSName('')
      }
    }
  }, [library, account, chainId])

  if (error) {
    return null
  } else if (!triedToEagerConnect) {
    return null
  } else if (typeof account !== 'string') {
    return (
      <Box>
        {
          <>
            {Object.keys(connectors).map((v, i) => (
              <Box key={v} mt={i === 0 ? 0 : 2}>
                <Button leftIcon={getConnectorDetails(v).icon} key={v} onClick={createConnectHandler(v)}>
                  Login with {getConnectorDetails(v).name}
                </Button>
              </Box>
            ))}
          </>
        }
      </Box>
    )
  }

  let leftIcon: string | undefined
  // check walletconnect first because sometime metamask can be installed but we're still using walletconnect
  if ((library?.provider as { isWalletConnect: boolean })?.isWalletConnect) {
    leftIcon = 'walletconnect'
  } else if (MetaMaskOnboarding.isMetaMaskInstalled()) {
    leftIcon = 'metamask'
  }

  return (
    <Stack direction="row" spacing={0} whiteSpace="nowrap" m={0} shouldWrapChildren>
      <ErrorBoundary
        fallback={
          <IconButton
            variant="outline"
            icon="warning"
            aria-label="Failed"
            isDisabled
            cursor="default !important"
            _hover={{}}
            _active={{}}
            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }}
          />
        }
      >
        <Suspense
          fallback={
            <Button
              variant="outline"
              isLoading
              cursor="default !important"
              _hover={{}}
              _active={{}}
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }}
            >
              {null}
            </Button>
          }
        >
          <ETHBalance />
        </Suspense>
      </ErrorBoundary>

      <Button
        as="a"
        leftIcon={leftIcon ? (leftIcon as 'edit') : undefined}
        rightIcon="external-link"
        style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
        {...{
          href: formatEtherscanLink(EtherscanType.Account, [chainId as number, account]),
          target: '_blank',
          rel: 'noopener noreferrer',
        }}
      >
        {ENSName || `${shortenHex(account, 4)}`}
      </Button>
    </Stack>
  )
}
