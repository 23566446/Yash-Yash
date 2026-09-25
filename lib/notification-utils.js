function shouldNotifyProposalPending(previousStatus, nextStatus) {
    return previousStatus !== 'pending' && nextStatus === 'pending';
}

module.exports = { shouldNotifyProposalPending };
